"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatMultiplier } from "@/lib/format";
import { verifyRoundInBrowser, type BrowserVerificationResult } from "@/lib/verify";

interface VerifyDialogProps {
  roundId: string;
  onClose: () => void;
}

/**
 * Provably fair audit for a crashed round. The "verify in this
 * browser" button recomputes sha256(seed) and the crash point with
 * WebCrypto - no trust in the server required.
 */
export function VerifyDialog({ roundId, onClose }: VerifyDialogProps) {
  const [result, setResult] = useState<BrowserVerificationResult | null>(null);
  const [checking, setChecking] = useState(false);

  const verification = useQuery({
    queryKey: ["verify", roundId],
    queryFn: () => api.verifyRound(roundId),
  });

  const runBrowserCheck = async () => {
    if (!verification.data) {
      return;
    }
    setChecking(true);
    try {
      setResult(await verifyRoundInBrowser(verification.data));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-[10px] border border-edge bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-11 items-center justify-between border-b border-edge px-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-2">
            Verificação provably fair
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {verification.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          )}

          {verification.isError && (
            <p className="text-[13px] text-danger">
              Não foi possível carregar a verificação desta rodada.
            </p>
          )}

          {verification.data && (
            <>
              <div className="py-2 text-center">
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                  crash point
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold text-accent">
                  {formatMultiplier(verification.data.crashPointHundredths)}
                </p>
              </div>

              <Field label="Hash publicado antes da rodada (compromisso)">
                {verification.data.seedHash}
              </Field>
              <Field label="Seed revelado após o crash">
                {verification.data.serverSeed}
              </Field>
              <Field label="Algoritmo">{verification.data.algorithm}</Field>

              <Button
                className="w-full"
                disabled={checking}
                onClick={() => void runBrowserCheck()}
              >
                {checking ? "Verificando…" : "Verificar neste navegador (WebCrypto)"}
              </Button>

              {result && (
                <div className="space-y-2.5 rounded-md border border-edge bg-bg p-3">
                  <CheckRow
                    ok={result.seedHashValid}
                    label="sha256(seed) confere com o hash publicado"
                  />
                  <CheckRow
                    ok={result.crashPointValid}
                    label={`crash point recalculado: ${formatMultiplier(result.computedCrashPointHundredths)}`}
                  />
                  <p
                    className={
                      result.seedHashValid && result.crashPointValid
                        ? "text-center text-xs text-accent"
                        : "text-center text-xs text-danger"
                    }
                  >
                    {result.seedHashValid && result.crashPointValid
                      ? "Resultado pré-determinado e não manipulado"
                      : "Divergência encontrada — esta rodada não passa na auditoria"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-ink-3">{label}</p>
      <p className="break-all rounded-md border border-edge bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
        {children}
      </p>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <BadgeCheck className="size-4 shrink-0 text-accent" />
      ) : (
        <ShieldAlert className="size-4 shrink-0 text-danger" />
      )}
      <span className={ok ? "text-ink" : "text-danger"}>{label}</span>
      <Badge variant={ok ? "success" : "danger"} className="ml-auto">
        {ok ? "ok" : "falhou"}
      </Badge>
    </div>
  );
}
