"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUserManager } from "@/lib/auth";
import { useAuthStore } from "@/stores/auth-store";

/** Finishes the OIDC redirect: exchanges the code and stores tokens. */
export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserManager()
      .signinRedirectCallback()
      .then((user) => {
        useAuthStore.getState().applyUser(user);
        router.replace("/");
      })
      .catch(() => setError("Falha ao concluir o login. Tente novamente."));
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="py-10 text-center text-[13px] text-ink-2">
          {error ?? "Concluindo login…"}
        </CardContent>
      </Card>
    </main>
  );
}
