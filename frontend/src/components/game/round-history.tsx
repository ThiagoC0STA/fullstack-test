"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMultiplier } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/game-store";
import { VerifyDialog } from "./verify-dialog";

function chipClass(crashPointHundredths: number): string {
  if (crashPointHundredths >= 1000) {
    return "text-gold border-gold/40 bg-gold/10";
  }
  if (crashPointHundredths >= 200) {
    return "text-neon border-neon/40 bg-neon/10";
  }
  return "text-danger border-danger/40 bg-danger/10";
}

/**
 * Last crash points. Every chip opens the provably fair verification
 * for that round - including an independent in-browser recompute.
 */
export function RoundHistory() {
  const history = useGameStore((state) => state.history);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-2 overflow-x-auto py-3">
          <ShieldCheck className="size-4 shrink-0 text-ink-dim" aria-hidden />
          {history.length === 0 && (
            <span className="text-xs text-ink-dim">Histórico chegando…</span>
          )}
          {history.map((round) => (
            <button
              key={round.roundId}
              type="button"
              onClick={() => setSelectedRoundId(round.roundId)}
              title="Clique para verificar (provably fair)"
              className={cn(
                "shrink-0 cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-transform hover:scale-105",
                chipClass(round.crashPointHundredths),
              )}
            >
              {formatMultiplier(round.crashPointHundredths)}
            </button>
          ))}
        </CardContent>
      </Card>
      {selectedRoundId && (
        <VerifyDialog
          roundId={selectedRoundId}
          onClose={() => setSelectedRoundId(null)}
        />
      )}
    </>
  );
}
