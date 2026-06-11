"use client";

import { useEffect, useRef } from "react";
import { multiplierAtElapsedMs, multiplierToDecimal } from "@crash/contracts";
import { useGameStore } from "@/stores/game-store";

const COLORS = {
  grid: "rgba(28, 39, 64, 0.6)",
  neon: "#00ff9d",
  neonSoft: "rgba(0, 255, 157, 0.25)",
  danger: "#ff3b5c",
  ink: "#e8edf7",
  inkDim: "#8b97b0",
  gold: "#ffc857",
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * The crash curve, rendered on canvas at the display refresh rate.
 * State is read imperatively from the store every frame so React never
 * re-renders during the animation; the server stays authoritative for
 * money - this is pure presentation.
 */
export function GameChart() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const prevPhaseRef = useRef<string>("idle");
  const crashFlashRef = useRef(0);

  useEffect(() => {
    let frame = 0;

    const spawnParticles = (width: number, height: number) => {
      const particles: Particle[] = [];
      for (let i = 0; i < 42; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        particles.push({
          x: width * 0.78,
          y: height * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          life: 1,
        });
      }
      particlesRef.current = particles;
    };

    const drawParticles = (ctx: CanvasRenderingContext2D) => {
      for (const particle of particlesRef.current) {
        if (particle.life <= 0) {
          continue;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.12;
        particle.life -= 0.018;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = Math.random() > 0.4 ? COLORS.danger : COLORS.gold;
        ctx.fillRect(particle.x, particle.y, 3, 3);
      }
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const state = useGameStore.getState();
      const now = Date.now() + state.clockSkewMs;

      drawGrid(ctx, width, height);

      if (prevPhaseRef.current !== "crashed" && state.phase === "crashed") {
        crashFlashRef.current = 1;
        spawnParticles(width, height);
      }
      prevPhaseRef.current = state.phase;

      if (state.phase === "betting" && state.bettingEndsAtMs) {
        drawBettingPhase(ctx, width, height, state.bettingEndsAtMs - now, state.seedHash);
      } else if (state.phase === "running" && state.startedAtMs) {
        const elapsed = Math.max(0, now - state.startedAtMs);
        drawCurve(ctx, width, height, elapsed, multiplierAtElapsedMs(elapsed), false);
      } else if (state.phase === "crashed" && state.crashPointHundredths) {
        const crashElapsed = estimateElapsedFor(state.crashPointHundredths);
        drawCurve(ctx, width, height, crashElapsed, state.crashPointHundredths, true);
        drawParticles(ctx);
      } else {
        drawIdle(ctx, width, height);
      }

      if (crashFlashRef.current > 0) {
        ctx.fillStyle = `rgba(255, 59, 92, ${0.25 * crashFlashRef.current})`;
        ctx.fillRect(0, 0, width, height);
        crashFlashRef.current = Math.max(0, crashFlashRef.current - 0.04);
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-border-soft bg-surface-2/60 sm:h-[420px]">
      <canvas ref={canvasRef} className="size-full" />
      <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[10px] text-ink-dim/70">
        m(t) = ⌊100·e^(0.00006t)⌋
      </p>
    </div>
  );
}

function estimateElapsedFor(multiplier: number): number {
  if (multiplier <= 100) {
    return 0;
  }
  return Math.log(multiplier / 100) / 0.00006;
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 56) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawIdle(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = COLORS.inkDim;
  ctx.font = "600 16px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Conectando à mesa…", width / 2, height / 2);
}

function drawBettingPhase(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  remainingMs: number,
  seedHash: string | null,
) {
  const remaining = Math.max(0, remainingMs);
  const seconds = (remaining / 1000).toFixed(1);

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.inkDim;
  ctx.font = "700 13px ui-sans-serif, system-ui";
  ctx.fillText("APOSTAS ABERTAS", width / 2, height / 2 - 64);

  ctx.fillStyle = COLORS.neon;
  ctx.font = "800 72px ui-monospace, monospace";
  ctx.shadowColor = COLORS.neon;
  ctx.shadowBlur = 24;
  ctx.fillText(`${seconds}s`, width / 2, height / 2 + 12);
  ctx.shadowBlur = 0;

  const barWidth = Math.min(380, width * 0.7);
  const progress = Math.min(1, remaining / 10_000);
  ctx.fillStyle = "rgba(28, 39, 64, 0.9)";
  ctx.fillRect(width / 2 - barWidth / 2, height / 2 + 44, barWidth, 6);
  ctx.fillStyle = COLORS.neon;
  ctx.fillRect(width / 2 - barWidth / 2, height / 2 + 44, barWidth * progress, 6);

  if (seedHash) {
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = "400 10px ui-monospace, monospace";
    ctx.fillText(
      `compromisso sha256: ${seedHash.slice(0, 20)}…${seedHash.slice(-8)}`,
      width / 2,
      height / 2 + 80,
    );
  }
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  multiplier: number,
  crashed: boolean,
) {
  const padding = 28;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const windowMs = Math.max(3000, elapsedMs);
  const maxMultiplier = Math.max(200, multiplier * 1.18);
  const color = crashed ? COLORS.danger : COLORS.neon;

  const pointFor = (t: number): [number, number] => {
    const m = Math.min(multiplierAtElapsedMs(t), multiplier);
    const x = padding + (t / windowMs) * plotWidth;
    const y = height - padding - ((m - 100) / (maxMultiplier - 100)) * plotHeight;
    return [x, y];
  };

  // area under the curve
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  const STEPS = 64;
  for (let i = 0; i <= STEPS; i++) {
    const [x, y] = pointFor((i / STEPS) * elapsedMs);
    ctx.lineTo(x, y);
  }
  const [tipX, tipY] = pointFor(elapsedMs);
  ctx.lineTo(tipX, height - padding);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, crashed ? "rgba(255,59,92,0.22)" : COLORS.neonSoft);
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fill();

  // the curve itself, glowing
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const [x, y] = pointFor((i / STEPS) * elapsedMs);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // tip
  ctx.beginPath();
  ctx.arc(tipX, tipY, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;

  // multiplier readout
  ctx.textAlign = "center";
  ctx.fillStyle = crashed ? COLORS.danger : COLORS.ink;
  ctx.font = "800 64px ui-monospace, monospace";
  ctx.shadowColor = color;
  ctx.shadowBlur = crashed ? 28 : 12;
  ctx.fillText(`${multiplierToDecimal(multiplier)}×`, width / 2, height / 2 - 8);
  ctx.shadowBlur = 0;

  if (crashed) {
    ctx.fillStyle = COLORS.danger;
    ctx.font = "700 18px ui-sans-serif, system-ui";
    ctx.fillText("CRASHOU", width / 2, height / 2 + 28);
  }
}
