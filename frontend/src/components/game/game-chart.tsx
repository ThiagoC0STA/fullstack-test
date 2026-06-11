"use client";

import { useEffect, useRef } from "react";
import {
  centsToDecimal,
  multiplierAtElapsedMs,
  multiplierToDecimal,
  type RoundHistoryItem,
} from "@crash/contracts";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";

interface CashoutPin {
  multiplier: number;
  mine: boolean;
  payoutCents: string | null;
}

const COLORS = {
  grid: "#1d1d1d",
  axis: "#2c2c2c",
  label: "#5d5d5d",
  ghost: "#3a3a3a",
  ink: "#ededed",
  ink2: "#8f8f8f",
  accent: "#3ecf8e",
  accentArea: "rgba(62, 207, 142, 0.10)",
  danger: "#e5484d",
  dangerArea: "rgba(229, 72, 77, 0.08)",
} as const;

const PAD = { left: 56, right: 20, top: 32, bottom: 36 } as const;
const TICK_CANDIDATES = [
  110, 120, 130, 150, 175, 200, 250, 300, 400, 500, 700, 1000, 1500, 2000,
  3000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000,
];
const X_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Scale {
  xFor: (t: number) => number;
  yFor: (m: number) => number;
  baseY: number;
  windowMs: number;
}

let cachedMonoFamily: string | null = null;

function monoFamily(): string {
  if (!cachedMonoFamily) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-geist-mono")
      .trim();
    cachedMonoFamily = value || "ui-monospace, monospace";
  }
  return cachedMonoFamily;
}

function mono(size: number, weight = 500): string {
  return `${weight} ${size}px ${monoFamily()}`;
}

/** Up to 4 "nice" multiplier gridlines inside (1.00x, max]. */
function multiplierTicks(maxMultiplier: number): number[] {
  const inRange = TICK_CANDIDATES.filter((c) => c > 100 && c <= maxMultiplier);
  if (inRange.length <= 4) {
    return inRange;
  }
  const picked = new Set<number>();
  for (let i = 0; i < 4; i++) {
    picked.add(inRange[Math.round((i * (inRange.length - 1)) / 3)] as number);
  }
  return [...picked];
}

function secondsStep(windowSeconds: number): number {
  return X_STEPS_SECONDS.find((step) => windowSeconds / step <= 5) ?? 300;
}

function elapsedForMultiplier(multiplier: number): number {
  if (multiplier <= 100) {
    return 0;
  }
  return Math.log(multiplier / 100) / 0.00006;
}

/**
 * The round, rendered like a market instrument: dynamic axes, a thin
 * live curve, the ghost of the previous round during the betting
 * window and session stats. State is read imperatively from the store
 * every frame so React never re-renders during the animation.
 */
export function GameChart() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const prevPhaseRef = useRef<string>("idle");
  const crashFlashRef = useRef(0);

  useEffect(() => {
    let frame = 0;

    const spawnParticles = (x: number, y: number) => {
      const particles: Particle[] = [];
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 0.9,
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
        particle.vy += 0.1;
        particle.life -= 0.02;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = Math.random() > 0.35 ? COLORS.danger : COLORS.ink2;
        ctx.fillRect(particle.x, particle.y, 2, 2);
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

      if (prevPhaseRef.current !== "crashed" && state.phase === "crashed") {
        crashFlashRef.current = 1;
      }
      prevPhaseRef.current = state.phase;

      drawSessionStats(ctx, width, state.history);

      if (state.phase === "betting" && state.bettingEndsAtMs) {
        drawBetting(
          ctx,
          width,
          height,
          state.bettingEndsAtMs - now,
          state.seedHash,
          state.history[0] ?? null,
        );
      } else if (state.phase === "running" && state.startedAtMs) {
        const elapsed = Math.max(0, now - state.startedAtMs);
        drawRound(
          ctx,
          width,
          height,
          elapsed,
          multiplierAtElapsedMs(elapsed),
          false,
          collectCashoutPins(),
        );
      } else if (state.phase === "crashed" && state.crashPointHundredths) {
        const crashElapsed = elapsedForMultiplier(state.crashPointHundredths);
        const tip = drawRound(
          ctx,
          width,
          height,
          crashElapsed,
          state.crashPointHundredths,
          true,
          collectCashoutPins(),
        );
        if (particlesRef.current.length === 0 && crashFlashRef.current === 1 && tip) {
          spawnParticles(tip[0], tip[1]);
        }
        drawParticles(ctx);
      } else {
        drawIdle(ctx, width, height);
      }

      if (state.phase !== "crashed") {
        particlesRef.current = [];
      }

      if (crashFlashRef.current > 0) {
        ctx.fillStyle = `rgba(229, 72, 77, ${0.1 * crashFlashRef.current})`;
        ctx.fillRect(0, 0, width, height);
        crashFlashRef.current = Math.max(0, crashFlashRef.current - 0.05);
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative h-[380px] w-full overflow-hidden rounded-lg border border-edge bg-surface sm:h-[460px]">
      <canvas ref={canvasRef} className="size-full" />
      <p className="pointer-events-none absolute right-3 bottom-2 font-mono text-[10px] text-ink-3">
        m(t) = ⌊100·e^(0.00006t)⌋
      </p>
    </div>
  );
}

/** Cashouts of the current round, ready to be pinned on the curve. */
function collectCashoutPins(): CashoutPin[] {
  const me = useAuthStore.getState().playerId;
  return useGameStore
    .getState()
    .bets.filter(
      (bet) => bet.status === "cashed_out" && bet.cashoutMultiplierHundredths !== null,
    )
    .map((bet) => ({
      multiplier: bet.cashoutMultiplierHundredths as number,
      mine: bet.playerId === me,
      payoutCents: bet.payoutCents,
    }));
}

function drawIdle(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.ink2;
  ctx.font = mono(13);
  ctx.fillText("Conectando à mesa…", width / 2, height / 2);
}

/** Session stats in the top-left corner: last and best crash points. */
function drawSessionStats(
  ctx: CanvasRenderingContext2D,
  width: number,
  history: RoundHistoryItem[],
) {
  const last = history[0];
  if (!last) {
    return;
  }
  const best = history.reduce(
    (max, round) => Math.max(max, round.crashPointHundredths),
    0,
  );
  ctx.textAlign = "left";
  ctx.font = mono(10);
  ctx.fillStyle = COLORS.label;
  ctx.fillText(
    `ÚLTIMA ${multiplierToDecimal(last.crashPointHundredths)}×   ·   MÁX ${multiplierToDecimal(best)}×`,
    PAD.left,
    19,
  );
}

/** Grid, axes and tick labels; returns the scale helpers. */
function drawChrome(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  windowMs: number,
  maxMultiplier: number,
): Scale {
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const xFor = (t: number) => PAD.left + (t / windowMs) * plotWidth;
  const yFor = (m: number) =>
    height - PAD.bottom - ((m - 100) / (maxMultiplier - 100)) * plotHeight;
  const baseY = yFor(100);

  ctx.textAlign = "right";
  ctx.font = mono(10);
  for (const tick of multiplierTicks(maxMultiplier)) {
    const y = yFor(tick);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(width - PAD.right, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`${multiplierToDecimal(tick)}×`, PAD.left - 10, y + 3);
  }

  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(PAD.left, baseY);
  ctx.lineTo(width - PAD.right, baseY);
  ctx.stroke();
  ctx.fillStyle = COLORS.label;
  ctx.fillText("1.00×", PAD.left - 10, baseY + 3);

  ctx.textAlign = "center";
  const windowSeconds = windowMs / 1000;
  const step = secondsStep(windowSeconds);
  for (let s = step; s <= windowSeconds; s += step) {
    const x = xFor(s * 1000);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, height - PAD.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`${s}s`, x, height - PAD.bottom + 16);
  }

  return { xFor, yFor, baseY, windowMs };
}

function traceCurve(
  ctx: CanvasRenderingContext2D,
  scale: Scale,
  elapsedMs: number,
  multiplier: number,
) {
  const STEPS = 72;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * elapsedMs;
    const x = scale.xFor(t);
    const y = scale.yFor(Math.min(multiplierAtElapsedMs(t), multiplier));
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
}

/**
 * Betting window: the previous round stays on screen as a ghost curve
 * so the chart is never an empty box, with the countdown on top.
 */
function drawBetting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  remainingMs: number,
  seedHash: string | null,
  lastRound: RoundHistoryItem | null,
) {
  const ghostCrash = lastRound?.crashPointHundredths ?? 200;
  const ghostElapsed = Math.max(1500, elapsedForMultiplier(ghostCrash));
  const scale = drawChrome(
    ctx,
    width,
    height,
    Math.max(4000, ghostElapsed * 1.05),
    Math.max(160, ghostCrash * 1.25),
  );

  if (lastRound) {
    ctx.beginPath();
    traceCurve(ctx, scale, ghostElapsed, ghostCrash);
    ctx.strokeStyle = COLORS.ghost;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const ghostX = scale.xFor(ghostElapsed);
    const ghostY = scale.yFor(ghostCrash);
    ctx.fillStyle = COLORS.ghost;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "right";
    ctx.font = mono(10);
    ctx.fillStyle = COLORS.label;
    ctx.fillText(
      `${multiplierToDecimal(ghostCrash)}×`,
      Math.min(ghostX + 4, width - PAD.right),
      ghostY - 8,
    );
  }

  const remaining = Math.max(0, remainingMs);
  const centerX = width / 2;
  const centerY = height / 2 - 12;

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.label;
  ctx.font = mono(11, 500);
  ctx.letterSpacing = "3px";
  ctx.fillText("PRÓXIMA RODADA", centerX, centerY - 56);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = COLORS.ink;
  ctx.font = mono(64, 600);
  ctx.fillText(`${(remaining / 1000).toFixed(1)}s`, centerX, centerY + 8);

  const barWidth = 220;
  const progress = Math.min(1, remaining / 10_000);
  ctx.fillStyle = "#242424";
  ctx.fillRect(centerX - barWidth / 2, centerY + 34, barWidth, 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(centerX - barWidth / 2, centerY + 34, barWidth * progress, 2);

  if (seedHash) {
    ctx.fillStyle = COLORS.label;
    ctx.font = mono(10);
    ctx.fillText(
      `compromisso sha256 ${seedHash.slice(0, 16)}…${seedHash.slice(-8)}`,
      centerX,
      centerY + 60,
    );
  }
}

/** Returns the tip position so the crash can anchor its particles. */
function drawRound(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  multiplier: number,
  crashed: boolean,
  cashouts: CashoutPin[] = [],
): [number, number] | null {
  const color = crashed ? COLORS.danger : COLORS.accent;
  const scale = drawChrome(
    ctx,
    width,
    height,
    Math.max(4000, elapsedMs * 1.05),
    Math.max(160, multiplier * 1.25),
  );

  const tipX = scale.xFor(elapsedMs);
  const tipY = scale.yFor(multiplier);

  // area under the curve
  ctx.beginPath();
  ctx.moveTo(PAD.left, scale.baseY);
  traceCurve(ctx, scale, elapsedMs, multiplier);
  ctx.lineTo(tipX, scale.baseY);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, PAD.top, 0, scale.baseY);
  fill.addColorStop(0, crashed ? COLORS.dangerArea : COLORS.accentArea);
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fill();

  // the curve
  ctx.beginPath();
  traceCurve(ctx, scale, elapsedMs, multiplier);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // every cashout of the round pinned on the curve; mine shows payout
  for (const pin of cashouts) {
    if (pin.multiplier > multiplier) {
      continue;
    }
    const pinX = scale.xFor(elapsedForMultiplier(pin.multiplier));
    const pinY = scale.yFor(pin.multiplier);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(pinX, pinY, pin.mine ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (pin.mine && pin.payoutCents) {
      ctx.textAlign = "center";
      ctx.font = mono(10, 600);
      ctx.fillText(`$ ${centsToDecimal(pin.payoutCents)}`, pinX, pinY - 10);
    }
  }

  // tip marker with a soft halo
  const halo = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 12);
  halo.addColorStop(0, crashed ? "rgba(229,72,77,0.25)" : "rgba(62,207,142,0.25)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // typographic readout
  const readoutX = PAD.left + (width - PAD.left - PAD.right) / 2;
  const readoutY = PAD.top + (height - PAD.top - PAD.bottom) * 0.34;
  ctx.textAlign = "center";
  if (crashed) {
    ctx.fillStyle = COLORS.danger;
    ctx.font = mono(11, 600);
    ctx.letterSpacing = "4px";
    ctx.fillText("CRASH", readoutX, readoutY - 48);
    ctx.letterSpacing = "0px";
  }
  ctx.fillStyle = crashed ? COLORS.danger : COLORS.accent;
  ctx.font = mono(72, 600);
  ctx.shadowColor = crashed ? COLORS.danger : COLORS.accent;
  ctx.shadowBlur = 16;
  ctx.fillText(`${multiplierToDecimal(multiplier)}×`, readoutX, readoutY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.label;
  ctx.font = mono(12);
  ctx.fillText(`${(elapsedMs / 1000).toFixed(1)}s`, readoutX, readoutY + 28);

  return [tipX, tipY];
}
