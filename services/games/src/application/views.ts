import type { BetView, RoundSnapshot } from "@crash/contracts";
import type { Bet } from "../domain/bet";
import type { Round } from "../domain/round";

export function toBetView(bet: Bet): BetView {
  return {
    betId: bet.id,
    playerId: bet.playerId,
    username: bet.username,
    amountCents: bet.amountCents,
    status: bet.status,
    cashoutMultiplierHundredths: bet.cashoutMultiplierHundredths,
    autoCashoutHundredths: bet.autoCashoutHundredths,
    payoutCents: bet.payoutCents,
  };
}

/**
 * Public snapshot of a round. The server seed and the crash point are
 * only exposed once the round has crashed; before that, players only
 * see the hash commitment.
 */
export function toRoundSnapshot(round: Round, now: Date): RoundSnapshot {
  const crashed = round.phase === "crashed";
  return {
    roundId: round.id,
    phase: round.phase,
    seedHash: round.seedHash,
    bettingEndsAt: round.phase === "betting" ? round.bettingEndsAt.toISOString() : null,
    startedAt: round.startedAt ? round.startedAt.toISOString() : null,
    multiplierHundredths: round.phase === "running" ? round.multiplierAt(now) : null,
    crashPointHundredths: crashed ? round.crashPointHundredths : null,
    serverTime: now.toISOString(),
    bets: round.bets.filter((bet) => bet.status !== "rejected").map(toBetView),
  };
}
