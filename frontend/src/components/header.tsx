"use client";

import { useState } from "react";
import { LogIn, LogOut, Volume2, VolumeX } from "lucide-react";
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
    <header className="border-b border-edge">
      <div className="mx-auto flex h-14 w-full max-w-[1300px] items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">
            CRASH<span className="text-accent">//</span>JUNGLE
          </h1>
          <span
            title={connected ? "Conectado em tempo real" : "Reconectando…"}
            className={cn(
              "size-1.5 rounded-full",
              connected ? "bg-accent" : "animate-pulse bg-danger",
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
              <span className="hidden text-[13px] text-ink-2 sm:inline">{username}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sair"
                onClick={() => void logout()}
              >
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
      </div>
    </header>
  );
}
