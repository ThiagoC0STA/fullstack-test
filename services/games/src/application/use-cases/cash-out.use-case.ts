import {
  createMessage,
  ROUTING_KEYS,
  WS_EVENTS,
  type BetCashedOutEvent,
  type BetView,
  type WalletCreditRequestedPayload,
} from "@crash/contracts";
import { RoundNotRunningError } from "../../domain/errors";
import { CurrentRoundStore } from "../current-round.store";
import type { ClockPort, GameBroadcastPort, TransactionalRunnerPort } from "../ports";
import { toBetView } from "../views";

/**
 * Authoritative cashout: the multiplier is computed server-side from
 * the engine clock at the moment the request is processed, never taken
 * from the client. The payout credit is staged transactionally.
 */
export class CashOutUseCase {
  constructor(
    private readonly store: CurrentRoundStore,
    private readonly runner: TransactionalRunnerPort,
    private readonly broadcast: GameBroadcastPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: { playerId: string }): Promise<BetView> {
    const round = this.store.current;
    if (!round) {
      throw new RoundNotRunningError();
    }
    const now = this.clock.now();
    const bet = round.cashOut(input.playerId, now);

    await this.runner.run(async (tx) => {
      await tx.rounds.persistBet(bet);
      const payload: WalletCreditRequestedPayload = {
        playerId: bet.playerId,
        roundId: round.id,
        betId: bet.id,
        amountCents: bet.payoutCents as string,
        reason: "cashout_payout",
      };
      await tx.outbox.add(
        createMessage(ROUTING_KEYS.WALLET_CREDIT_REQUESTED, payload, now),
        ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
      );
    });

    const event: BetCashedOutEvent = { roundId: round.id, bet: toBetView(bet) };
    this.broadcast.emit(WS_EVENTS.BET_CASHED_OUT, event);
    return toBetView(bet);
  }
}
