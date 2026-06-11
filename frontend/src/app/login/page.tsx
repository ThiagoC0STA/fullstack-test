"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";

/** Redirects straight to Keycloak (OIDC authorization code + PKCE). */
export default function LoginPage() {
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    const timeout = setTimeout(() => void login(), 400);
    return () => clearTimeout(timeout);
  }, [login]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-ink-dim">Redirecionando para o Keycloak…</p>
          <Button onClick={() => void login()}>Ir agora</Button>
        </CardContent>
      </Card>
    </main>
  );
}
