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
        {/* min-w-0 keeps wide children (chips, canvas) from inflating the
            1fr track past the viewport and pushing the aside off-screen */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <GameChart />
            <BetControls />
          </div>
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <LiveBets />
          </aside>
        </div>
      </main>
    </>
  );
}
