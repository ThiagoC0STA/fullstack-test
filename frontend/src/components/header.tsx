"use client";

import { useState } from "react";
import { LogIn, LogOut, Volume2, VolumeX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletBadge } from "@/components/game/wallet-badge";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

export function Header() {
  const status = useAuthStore((state) => state.status);
  const username = useAuthStore((state) => state.username);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const connected = useGameStore((state) => state.connected);
  const [muted, setMuted] = useState(() => sounds.muted);

  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <Zap className="size-6 text-neon" aria-hidden />
        <h1 className="text-lg font-extrabold tracking-tight">
          CRASH<span className="text-neon">//</span>JUNGLE
        </h1>
        <span
          title={connected ? "Conectado em tempo real" : "Reconectando…"}
          className={cn(
            "ml-2 size-2 rounded-full",
            connected ? "bg-neon" : "animate-pulse bg-danger",
          )}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? "Ativar som" : "Silenciar"}
          onClick={() => setMuted(sounds.toggleMute())}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>

        {status === "authenticated" ? (
          <>
            <WalletBadge />
            <span className="hidden font-mono text-sm text-ink-dim sm:inline">
              {username}
            </span>
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void logout()}>
              <LogOut className="size-4" />
            </Button>
          </>
        ) : (
          <Button onClick={() => void login()} disabled={status === "loading"}>
            <LogIn className="size-4" />
            Entrar
          </Button>
        )}
      </div>
    </header>
  );
}
