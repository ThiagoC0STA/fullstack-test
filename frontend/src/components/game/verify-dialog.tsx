"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <CardTitle>Verificação provably fair</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {verification.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          )}

          {verification.isError && (
            <p className="text-sm text-danger">
              Não foi possível carregar a verificação desta rodada.
            </p>
          )}

          {verification.data && (
            <>
              <div className="text-center">
                <p className="text-xs uppercase tracking-widest text-ink-dim">
                  crash point
                </p>
                <p className="font-mono text-4xl font-bold text-neon">
                  {formatMultiplier(verification.data.crashPointHundredths)}
                </p>
              </div>

              <Field label="Hash publicado ANTES da rodada (compromisso)">
                {verification.data.seedHash}
              </Field>
              <Field label="Seed revelado APÓS o crash">
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
                <div className="space-y-2 rounded-lg bg-surface-2 p-3">
                  <CheckRow
                    ok={result.seedHashValid}
                    label="sha256(seed) confere com o hash publicado"
                  />
                  <CheckRow
                    ok={result.crashPointValid}
                    label={`crash point recalculado: ${formatMultiplier(result.computedCrashPointHundredths)}`}
                  />
                  {result.seedHashValid && result.crashPointValid ? (
                    <p className="text-center text-xs text-neon">
                      Resultado pré-determinado e não manipulado ✓
                    </p>
                  ) : (
                    <p className="text-center text-xs text-danger">
                      Divergência encontrada — esta rodada não passa na auditoria!
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-ink-dim">{label}</p>
      <p className="break-all rounded-lg bg-surface-2 p-2 font-mono text-xs text-ink">
        {children}
      </p>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <BadgeCheck className="size-4 shrink-0 text-neon" />
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
