import {
  createMessage,
  ROUTING_KEYS,
  WS_EVENTS,
  type BetSettledEvent,
  type WalletCreditRequestedPayload,
  type WalletDebitSettledMessage,
} from "@crash/contracts";
import type { Bet } from "../../domain/bet";
import { CurrentRoundStore } from "../current-round.store";
import type {
  ClockPort,
  GameBroadcastPort,
  TransactionContext,
  TransactionalRunnerPort,
} from "../ports";
import { toBetView } from "../views";

/**
 * Step 2 of the bet saga: the wallet replied to our debit request.
 *
 * - succeeded + round still open -> bet becomes active
 * - failed -> bet rejected (insufficient funds etc.)
 * - succeeded but the round already locked/crashed -> COMPENSATION:
 *   the debit is refunded through wallet.credit.requested(bet_refund)
 *   and the bet is rejected. This is what keeps the two services
 *   consistent without distributed transactions.
 */
export class HandleDebitSettledUseCase {
  constructor(
    private readonly store: CurrentRoundStore,
    private readonly runner: TransactionalRunnerPort,
    private readonly broadcast: GameBroadcastPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(message: WalletDebitSettledMessage): Promise<void> {
    // wrapper object: TS control-flow analysis cannot see assignments
    // made inside the transaction closure on a plain `let` binding
    const touched: { bet: Bet | null } = { bet: null };
    let settled: { bet: Bet; roundId: string } | null;
    try {
      settled = await this.runner.run(async (tx) => {
        const now = this.clock.now();
        const isNew = await tx.inbox.recordIfNew(message.messageId, message.type, now);
        if (!isNew) {
          return null;
        }

        const { betId, roundId, status } = message.payload;
        const currentRound = this.store.current;
        const inCurrentRound = currentRound?.id === roundId;
        const bet = inCurrentRound
          ? currentRound.bets.find((candidate) => candidate.id === betId)
          : (await tx.rounds.findById(roundId))?.bets.find(
              (candidate) => candidate.id === betId,
            );

        if (!bet || bet.status !== "pending_debit") {
          return null;
        }

        if (status === "failed") {
          touched.bet = bet;
          bet.reject();
          await tx.rounds.persistBet(bet);
          return { bet, roundId };
        }

        const roundStillOpen =
          inCurrentRound &&
          (currentRound.phase === "betting" || currentRound.phase === "running");

        if (roundStillOpen) {
          touched.bet = bet;
          bet.confirmDebit();
          await tx.rounds.persistBet(bet);
          return { bet, roundId };
        }

        await this.refund(tx, bet, roundId, now);
        touched.bet = bet;
        bet.reject();
        await tx.rounds.persistBet(bet);
        return { bet, roundId };
      });
    } catch (error: unknown) {
      // keep memory consistent with the database that rejected the
      // write; the inbox row rolled back in the same transaction, so
      // the broker's redelivery will settle the bet again
      touched.bet?.revertSettlement();
      throw error;
    }

    if (settled) {
      const event: BetSettledEvent = {
        roundId: settled.roundId,
        bet: toBetView(settled.bet),
      };
      this.broadcast.emit(WS_EVENTS.BET_SETTLED, event);
    }
  }

  private async refund(
    tx: TransactionContext,
    bet: Bet,
    roundId: string,
    now: Date,
  ): Promise<void> {
    const payload: WalletCreditRequestedPayload = {
      playerId: bet.playerId,
      roundId,
      betId: bet.id,
      amountCents: bet.amountCents,
      reason: "bet_refund",
    };
    await tx.outbox.add(
      createMessage(ROUTING_KEYS.WALLET_CREDIT_REQUESTED, payload, now),
      ROUTING_KEYS.WALLET_CREDIT_REQUESTED,
    );
  }
}
