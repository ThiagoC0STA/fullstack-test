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
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <RoundHistory />
          <GameChart />
          <BetControls />
        </div>
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <LiveBets />
        </aside>
      </main>
    </>
  );
}
