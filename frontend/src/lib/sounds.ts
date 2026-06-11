/**
 * Tiny WebAudio synthesizer: zero audio assets, zero copyright. The
 * context is created lazily on the first user gesture (browser policy).
 */
const MUTE_KEY = "crash-game:muted";

class SoundEngine {
  private context: AudioContext | null = null;
  private mutedState: boolean | null = null;

  get muted(): boolean {
    if (this.mutedState === null) {
      this.mutedState =
        typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
    }
    return this.mutedState;
  }

  toggleMute(): boolean {
    this.mutedState = !this.muted;
    localStorage.setItem(MUTE_KEY, this.mutedState ? "1" : "0");
    return this.mutedState;
  }

  betPlaced(): void {
    this.tone([{ frequency: 660, start: 0, duration: 0.07, type: "square", gain: 0.05 }]);
  }

  cashOut(): void {
    this.tone([
      { frequency: 880, start: 0, duration: 0.09, type: "sine", gain: 0.08 },
      { frequency: 1320, start: 0.09, duration: 0.16, type: "sine", gain: 0.08 },
    ]);
  }

  crash(): void {
    const ctx = this.resume();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  private tone(
    notes: Array<{
      frequency: number;
      start: number;
      duration: number;
      type: OscillatorType;
      gain: number;
    }>,
  ): void {
    const ctx = this.resume();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(note.gain, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }
  }

  private resume(): AudioContext | null {
    if (typeof window === "undefined" || this.muted) {
      return null;
    }
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    return this.context;
  }
}

export const sounds = new SoundEngine();
