import {
  createMessage,
  ROUTING_KEYS,
  WS_EVENTS,
  type BetPlacedEvent,
  type BetView,
  type CentsString,
  type MultiplierHundredths,
  type WalletDebitRequestedPayload,
} from "@crash/contracts";
import { BettingClosedError } from "../../domain/errors";
import { CurrentRoundStore } from "../current-round.store";
import type { ClockPort, GameBroadcastPort, TransactionalRunnerPort } from "../ports";
import { toBetView } from "../views";

/**
 * Step 1 of the bet saga. The bet is accepted as pending_debit and the
 * wallet debit request is staged in the SAME transaction (outbox). The
 * bet only becomes active when wallet.debit.settled comes back.
 */
export class PlaceBetUseCase {
  constructor(
    private readonly store: CurrentRoundStore,
    private readonly runner: TransactionalRunnerPort,
    private readonly broadcast: GameBroadcastPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: {
    playerId: string;
    username: string;
    amountCents: CentsString;
    autoCashoutHundredths?: MultiplierHundredths | null;
  }): Promise<BetView> {
    const round = this.store.current;
    if (!round) {
      throw new BettingClosedError();
    }
    const now = this.clock.now();
    const bet = round.placeBet({
      playerId: input.playerId,
      username: input.username,
      amountCents: input.amountCents,
      autoCashoutHundredths: input.autoCashoutHundredths ?? null,
      now,
    });

    try {
      await this.runner.run(async (tx) => {
        await tx.rounds.persistBet(bet);
        const payload: WalletDebitRequestedPayload = {
          playerId: bet.playerId,
          roundId: round.id,
          betId: bet.id,
          amountCents: bet.amountCents,
          reason: "bet",
        };
        await tx.outbox.add(
          createMessage(ROUTING_KEYS.WALLET_DEBIT_REQUESTED, payload, now),
          ROUTING_KEYS.WALLET_DEBIT_REQUESTED,
        );
      });
    } catch (error: unknown) {
      // keep memory consistent with the database that rejected the write
      round.bets.splice(round.bets.indexOf(bet), 1);
      throw error;
    }

    const event: BetPlacedEvent = { roundId: round.id, bet: toBetView(bet) };
    this.broadcast.emit(WS_EVENTS.BET_PLACED, event);
    return toBetView(bet);
  }
}
