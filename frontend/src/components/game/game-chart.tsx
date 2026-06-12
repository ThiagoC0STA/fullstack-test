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
// "Nice" 1·2·5 ladder in hundredths (0.10x, 0.20x, 0.50x, 1.00x, …) used for
// the multiplier gridlines. Time gridlines use a seconds ladder.
const NICE_MULT_STEPS: number[] = (() => {
  const out: number[] = [];
  for (let exp = 1; exp <= 7; exp++) {
    const base = 10 ** exp;
    out.push(base, 2 * base, 5 * base);
  }
  return out;
})();
const X_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
// target pixel spacing between gridlines; the live step is chosen to land
// near these and crossfades between ladder rungs so nothing ever pops.
const TARGET_Y_PX = 56;
const TARGET_X_PX = 104;

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

interface VisualScaleState {
  key: string;
  windowMs: number;
  maxMult: number;
  lastFrameMs: number;
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

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Picks the two adjacent ladder rungs that bracket `ideal` plus a blend
 * factor `t` (0 at the lower rung, 1 at the upper). Drawing the lower rung
 * with alpha `1 - t` and the upper with `t` crossfades the grid density
 * continuously as the axis grows, so gridlines never jump or pop.
 */
function bracketStep(
  ideal: number,
  ladder: number[],
): { lower: number; upper: number; t: number } {
  const first = ladder[0] as number;
  if (ideal <= first) {
    return { lower: first, upper: first, t: 0 };
  }
  let lower = first;
  let upper = ladder[ladder.length - 1] as number;
  for (let i = 0; i < ladder.length; i++) {
    const rung = ladder[i] as number;
    if (rung <= ideal) {
      lower = rung;
      upper = (ladder[i + 1] as number | undefined) ?? rung * 2;
    } else {
      break;
    }
  }
  const t = upper > lower ? (ideal - lower) / (upper - lower) : 0;
  return { lower, upper, t };
}

const GROWTH_RATE_PER_MS = 0.00006;

function elapsedForMultiplier(multiplier: number): number {
  if (multiplier <= 100) {
    return 0;
  }
  return Math.log(multiplier / 100) / GROWTH_RATE_PER_MS;
}

/**
 * Continuous curve value (hundredths, unfloored) for drawing only. The
 * authoritative m(t) floors to integer hundredths, which makes the line
 * stair-step at low multipliers; the smooth value keeps the rendered
 * curve buttery while money still uses the floored value everywhere.
 */
function smoothMultiplierAt(elapsedMs: number): number {
  return 100 * Math.exp(GROWTH_RATE_PER_MS * elapsedMs);
}

const CURVE_TAKEOFF_MS = 2600;
const MIN_WINDOW_MS = 2500;
const WINDOW_HEADROOM = 1.12;
// the axis height tracks the curve's RISE (multiplier - 1.00x), not the
// absolute multiplier, so the curve fills a constant ~2/3 of the height
// and climbs steeply from the first instant instead of hugging the
// baseline. The minimum span avoids a zero-height axis at 1.00x and
// gives the opening below 1.08x room to climb into.
const SPAN_HEADROOM = 1.5;
const MIN_MULT_SPAN = 12;

/** Top of the y-axis (hundredths) for a given live multiplier. */
function axisTop(multiplier: number): number {
  return 100 + Math.max(MIN_MULT_SPAN, (multiplier - 100) * SPAN_HEADROOM);
}

function smoothTakeoffMultiplierAt(
  elapsedMs: number,
  tipMultiplier: number,
): number {
  if (elapsedMs >= CURVE_TAKEOFF_MS) {
    return Math.min(smoothMultiplierAt(elapsedMs), tipMultiplier);
  }

  const t = elapsedMs / CURVE_TAKEOFF_MS;
  const t2 = t * t;
  const t3 = t2 * t;
  const start = 100;
  const end = smoothMultiplierAt(CURVE_TAKEOFF_MS);
  // end tangent (in t-space) MUST equal the exponential's own slope at the
  // seam, otherwise the line bends — a visible C1 kink at CURVE_TAKEOFF_MS.
  // d/dt[100·e^(k·t)] = k·m, so the t-normalised tangent is k·end·T.
  const endSlope = GROWTH_RATE_PER_MS * end * CURVE_TAKEOFF_MS;
  // cubic Hermite with a flat start (tangent 0, eases off the baseline) and
  // the exponential's slope at the end → curve and seam are C1-continuous.
  const value =
    (2 * t3 - 3 * t2 + 1) * start +
    (-2 * t3 + 3 * t2) * end +
    (t3 - t2) * endSlope;

  return Math.max(start, Math.min(value, tipMultiplier));
}

/**
 * Axes that grow continuously and self-similarly with the round, so the
 * live tip sits at a near-fixed fraction of the frame and the curve
 * flows smoothly beneath it every frame — no quantization thresholds to
 * jump across (those read as the curve "teleporting").
 */
function liveScale(
  elapsedMs: number,
  multiplier: number,
): { windowMs: number; maxMult: number } {
  return {
    windowMs: Math.max(MIN_WINDOW_MS, elapsedMs * WINDOW_HEADROOM),
    maxMult: axisTop(multiplier),
  };
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
  const elapsedRef = useRef<{ key: string; value: number }>({ key: "", value: 0 });
  const visualScaleRef = useRef<VisualScaleState>({
    key: "",
    windowMs: MIN_WINDOW_MS,
    maxMult: axisTop(100),
    lastFrameMs: 0,
  });

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
        const key = state.roundId ?? "running";
        const rawElapsed = Math.max(0, now - state.startedAtMs);
        // a skew correction must never pull the curve backwards
        if (elapsedRef.current.key !== key) {
          elapsedRef.current = { key, value: rawElapsed };
        } else {
          elapsedRef.current.value = Math.max(elapsedRef.current.value, rawElapsed);
        }
        const elapsed = elapsedRef.current.value;
        const multiplier = multiplierAtElapsedMs(elapsed);
        const smoothMultiplier = smoothMultiplierAt(elapsed);
        const scale = smoothVisualScale(
          visualScaleRef.current,
          key,
          liveScale(elapsed, smoothMultiplier),
          now,
          elapsed,
          smoothMultiplier,
        );
        visualScaleRef.current = scale;
        drawRound(
          ctx,
          width,
          height,
          elapsed,
          multiplier,
          false,
          collectCashoutPins(),
          scale.windowMs,
          scale.maxMult,
        );
      } else if (state.phase === "crashed" && state.crashPointHundredths) {
        const crashElapsed = elapsedForMultiplier(state.crashPointHundredths);
        const scale = liveScale(crashElapsed, state.crashPointHundredths);
        const tip = drawRound(
          ctx,
          width,
          height,
          crashElapsed,
          state.crashPointHundredths,
          true,
          collectCashoutPins(),
          scale.windowMs,
          scale.maxMult,
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

function smoothVisualScale(
  previous: VisualScaleState,
  key: string,
  target: { windowMs: number; maxMult: number },
  frameTimeMs: number,
  elapsedMs: number,
  tipMultiplier: number,
): VisualScaleState {
  if (previous.key !== key) {
    return {
      key,
      windowMs: target.windowMs,
      maxMult: target.maxMult,
      lastFrameMs: frameTimeMs,
    };
  }

  const dt = Math.min(50, Math.max(0, frameTimeMs - previous.lastFrameMs));
  const alpha = 1 - Math.exp(-dt / 140);
  const windowMs = previous.windowMs + (target.windowMs - previous.windowMs) * alpha;
  const maxMult = previous.maxMult + (target.maxMult - previous.maxMult) * alpha;

  return {
    key,
    windowMs: Math.max(MIN_WINDOW_MS, elapsedMs * 1.03, windowMs),
    maxMult: Math.max(axisTop(tipMultiplier * 0.92), maxMult),
    lastFrameMs: frameTimeMs,
  };
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

  // both axes are smoothed continuously, so the only source of jank is the
  // CHOICE of which gridlines to draw. Crossfading two ladder rungs by alpha
  // (plus edge fades) keeps the grid gliding instead of stepping.
  ctx.textAlign = "right";
  ctx.font = mono(10);
  const span = Math.max(1, maxMultiplier - 100);
  const idealMultStep = (span / plotHeight) * TARGET_Y_PX;
  const mult = bracketStep(idealMultStep, NICE_MULT_STEPS);
  drawMultiplierGrid(ctx, yFor, baseY, maxMultiplier, width, mult.lower, 1 - mult.t);
  if (mult.upper !== mult.lower) {
    drawMultiplierGrid(ctx, yFor, baseY, maxMultiplier, width, mult.upper, mult.t);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, baseY);
  ctx.lineTo(width - PAD.right, baseY);
  ctx.stroke();
  ctx.fillStyle = COLORS.label;
  ctx.fillText("1.00×", PAD.left - 10, baseY + 3);

  ctx.textAlign = "center";
  const windowSeconds = windowMs / 1000;
  const idealTimeStep = (windowSeconds / plotWidth) * TARGET_X_PX;
  const time = bracketStep(idealTimeStep, X_STEPS_SECONDS);
  drawTimeGrid(ctx, xFor, height, windowSeconds, time.lower, 1 - time.t);
  if (time.upper !== time.lower) {
    drawTimeGrid(ctx, xFor, height, windowSeconds, time.upper, time.t);
  }
  ctx.globalAlpha = 1;

  return { xFor, yFor, baseY, windowMs };
}

/**
 * One density level of horizontal (multiplier) gridlines at `level`
 * intensity. Lines fade as they compress into the baseline and fade in as
 * they are born at the top of a growing axis, so the grid never pops.
 */
function drawMultiplierGrid(
  ctx: CanvasRenderingContext2D,
  yFor: (m: number) => number,
  baseY: number,
  maxMultiplier: number,
  width: number,
  step: number,
  level: number,
) {
  if (level <= 0.02) {
    return;
  }
  const firstValue = Math.ceil((100 + 1e-6) / step) * step;
  for (let value = firstValue; value <= maxMultiplier + 1e-6; value += step) {
    const y = yFor(value);
    const intensity =
      level *
      clamp((baseY - y) / 28, 0, 1) *
      clamp((maxMultiplier - value) / (step * 0.85), 0, 1);
    if (intensity <= 0.02) {
      continue;
    }
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(width - PAD.right, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`${multiplierToDecimal(value)}×`, PAD.left - 10, y + 3);
  }
}

/** One density level of vertical (time) gridlines at `level` intensity. */
function drawTimeGrid(
  ctx: CanvasRenderingContext2D,
  xFor: (t: number) => number,
  height: number,
  windowSeconds: number,
  stepSeconds: number,
  level: number,
) {
  if (level <= 0.02) {
    return;
  }
  for (let s = stepSeconds; s <= windowSeconds + 1e-6; s += stepSeconds) {
    const x = xFor(s * 1000);
    const intensity =
      level *
      clamp((x - PAD.left) / 44, 0, 1) *
      clamp((windowSeconds - s) / (stepSeconds * 0.85), 0, 1);
    if (intensity <= 0.02) {
      continue;
    }
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, height - PAD.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.label;
    ctx.fillText(`${Math.round(s)}s`, x, height - PAD.bottom + 16);
  }
}

/**
 * Traces the curve as a dense polyline. Because xFor is linear in t, a fixed
 * ~1px step in x maps to an even step in t, so straight segments at that
 * density are visually indistinguishable from the exact analytic curve — no
 * Bézier control-point overshoot, no faceting, no kink. The path is left open
 * so callers can stroke it or close it into the area fill.
 */
function traceCurve(
  ctx: CanvasRenderingContext2D,
  scale: Scale,
  elapsedMs: number,
  multiplier: number,
) {
  const curveWidth = Math.max(1, scale.xFor(elapsedMs) - PAD.left);
  const steps = Math.max(2, Math.ceil(curveWidth));

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * elapsedMs;
    const x = scale.xFor(t);
    const y = scale.yFor(smoothTakeoffMultiplierAt(t, multiplier));
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
    Math.max(MIN_WINDOW_MS, ghostElapsed * 1.05),
    axisTop(ghostCrash),
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
    const ghostY = scale.yFor(smoothTakeoffMultiplierAt(ghostElapsed, ghostCrash));
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
  windowMs = Math.max(MIN_WINDOW_MS, elapsedMs * WINDOW_HEADROOM),
  maxMult = axisTop(multiplier),
): [number, number] | null {
  const color = crashed ? COLORS.danger : COLORS.accent;
  const scale = drawChrome(ctx, width, height, windowMs, maxMult);

  // the curve uses one visual value for fill, stroke and marker.
  const rawCurveTip = crashed ? multiplier : smoothMultiplierAt(elapsedMs);
  const curveTip = smoothTakeoffMultiplierAt(elapsedMs, rawCurveTip);
  const tipX = scale.xFor(elapsedMs);
  const tipY = scale.yFor(curveTip);

  // area under the curve
  ctx.beginPath();
  ctx.moveTo(PAD.left, scale.baseY);
  traceCurve(ctx, scale, elapsedMs, curveTip);
  ctx.lineTo(tipX, scale.baseY);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, PAD.top, 0, scale.baseY);
  fill.addColorStop(0, crashed ? COLORS.dangerArea : COLORS.accentArea);
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fill();

  // the curve reaches the marker instead of flattening on the floored value.
  ctx.beginPath();
  traceCurve(ctx, scale, elapsedMs, curveTip);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // every cashout of the round pinned on the curve; mine shows payout
  for (const pin of cashouts) {
    if (pin.multiplier > multiplier) {
      continue;
    }
    const pinElapsed = elapsedForMultiplier(pin.multiplier);
    const pinX = scale.xFor(pinElapsed);
    const pinY = scale.yFor(smoothTakeoffMultiplierAt(pinElapsed, curveTip));
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
