"use client";

import { useEffect, useState } from "react";
import {
  multiplierAtElapsedMs,
  type MultiplierHundredths,
} from "@crash/contracts";
import { useGameStore } from "@/stores/game-store";

/**
 * 60fps multiplier: between 10Hz server ticks the exact public curve
 * m(t) = floor(100 * e^(0.00006t)) is evaluated locally against the
 * skew-corrected server clock. The server stays authoritative for
 * money; this only drives the animation.
 */
export function useLiveMultiplier(): MultiplierHundredths {
  const phase = useGameStore((state) => state.phase);
  const startedAtMs = useGameStore((state) => state.startedAtMs);
  const clockSkewMs = useGameStore((state) => state.clockSkewMs);
  const crashPoint = useGameStore((state) => state.crashPointHundredths);
  const [value, setValue] = useState<MultiplierHundredths>(100);

  useEffect(() => {
    if (phase === "crashed" && crashPoint) {
      setValue(crashPoint);
      return;
    }
    if (phase !== "running" || startedAtMs === null) {
      setValue(100);
      return;
    }
    let frame = 0;
    const loop = () => {
      const elapsed = Date.now() + clockSkewMs - startedAtMs;
      setValue(multiplierAtElapsedMs(Math.max(0, elapsed)));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, startedAtMs, clockSkewMs, crashPoint]);

  return value;
}
