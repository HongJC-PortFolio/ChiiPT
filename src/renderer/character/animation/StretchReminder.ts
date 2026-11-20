export const stretchIntervalSeconds = 30 * 60;

/** Counts awake app time, excluding long suspended/background stalls. */
export class StretchReminder {
  private elapsed = 0;
  private playing: number | null = null;
  start(): void {
    if (this.playing !== null) return;
    this.elapsed = 0;
    this.playing = 0;
  }
  update(dt: number, awake: boolean, duration: number): number | null {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1)) : 0;
    if (!awake) { this.playing = null; return null; }
    if (this.playing !== null) {
      this.playing += dt;
      if (this.playing >= duration) { this.playing = null; this.elapsed = 0; }
      return this.playing;
    }
    this.elapsed += dt;
    if (this.elapsed >= stretchIntervalSeconds) { this.elapsed = 0; this.playing = 0; }
    return this.playing;
  }
}

export const stretchMotion = { travelSeconds: 5, repeats: 3, walkFps: 12 } as const;
export const stretchScale = 1.5;
export function stretchJourney(time: number, clipSeconds: number) {
  const travel=stretchMotion.travelSeconds, hold=clipSeconds*stretchMotion.repeats;
  const phase=time<travel?'outbound':time<travel+hold?'stretch':'returning';
  const progress=phase==='outbound'?time/travel:phase==='stretch'?1:1-(time-travel-hold)/travel;
  const t=Math.max(0,Math.min(1,progress));
  return {phase,position:t*t*(3-2*t),clipTime:Math.max(0,time-travel)%clipSeconds,
    cycle:Math.min(stretchMotion.repeats,Math.floor(Math.max(0,time-travel)/clipSeconds)+1),
    scale:phase==='stretch'?stretchScale:1+(stretchScale-1)*t*t*(3-2*t)};
}
