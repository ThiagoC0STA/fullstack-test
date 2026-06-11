"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { VerifyDialog } from "./verify-dialog";

function chipColor(crashPointHundredths: number): string {
  if (crashPointHundredths >= 1000) {
    return "text-gold";
  }
  if (crashPointHundredths >= 200) {
    return "text-accent";
  }
  return "text-danger";
}

/**
 * Last crash points as a quiet strip. Every chip opens the provably
 * fair audit for that round, including an in-browser recompute.
 */
export function RoundHistory() {
  const history = useGameStore((state) => state.history);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  return (
    <>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <ShieldCheck
          className="size-3.5 shrink-0 text-ink-3"
          aria-label="Histórico verificável (provably fair)"
        />
        {history.length === 0 && (
          <span className="text-xs text-ink-3">Histórico chegando…</span>
        )}
        {history.map((round) => (
          <button
            key={round.roundId}
            type="button"
            onClick={() => setSelectedRoundId(round.roundId)}
            title="Verificar rodada (provably fair)"
            className={cn(
              "shrink-0 cursor-pointer rounded border border-edge px-2 py-1 font-mono text-[11px] font-medium",
              "transition-colors duration-150 ease-out hover:border-edge-strong",
              "max-sm:grid max-sm:min-h-11 max-sm:place-items-center max-sm:px-3",
              chipColor(round.crashPointHundredths),
            )}
          >
            {formatMultiplier(round.crashPointHundredths)}
          </button>
        ))}
      </div>
      {selectedRoundId && (
        <VerifyDialog
          roundId={selectedRoundId}
          onClose={() => setSelectedRoundId(null)}
        />
      )}
    </>
  );
}
