"use client";

import { BetControls } from "@/components/game/bet-controls";
import { GameChart } from "@/components/game/game-chart";
import { LiveBets } from "@/components/game/live-bets";
import { RoundHistory } from "@/components/game/round-history";
import { Header } from "@/components/header";
import { useGameSocket } from "@/hooks/use-game-socket";

export default function GamePage() {
  useGameSocket();

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-6 py-6">
        <RoundHistory />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <GameChart />
            <BetControls />
          </div>
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <LiveBets />
          </aside>
        </div>
      </main>
    </>
  );
}
