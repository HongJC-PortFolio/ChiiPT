import type { PostureResult } from '../../shared/types/index.ts';

export const shoulderSettings = {
  enterDegrees: 2,
  exitDegrees: 1,
  maximumDegrees: 10,
  minConfidence: .2,
  smoothingMs: 160,
  settleMs: 200,
  // Direction describes pet travel: left shoulder Y < right shoulder Y => right.
  // Landmark identity, rather than image X order, determines direction.
  mirrorDirection: false
};

type Landmark = { x: number; y: number; visibility?: number; presence?: number };
type Frame = { landmarks: readonly Landmark[]; imageWidth: number; imageHeight: number; timestampMs: number };

export class ShoulderPosture {
  angleDegrees = 0;
  private lastTime: number | null = null;
  private state: PostureResult['state'] = 'neutral';
  private candidate: PostureResult['state'] = 'neutral';
  private candidateSince = 0;

  reset(): void {
    this.lastTime = null;
    this.angleDegrees = 0;
    this.state = this.candidate = 'neutral';
    this.candidateSince = 0;
  }

  update(frame: Frame): PostureResult {
    const a = frame.landmarks[11], b = frame.landmarks[12];
    if (![frame.imageWidth, frame.imageHeight].every(v => Number.isFinite(v) && v > 0) ||
        !Number.isFinite(frame.timestampMs) || !a || !b || [a, b].some(p =>
          !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
          !Number.isFinite(p.visibility ?? 1) || !Number.isFinite(p.presence ?? 1) ||
          (p.visibility ?? 1) < shoulderSettings.minConfidence ||
          (p.presence ?? 1) < shoulderSettings.minConfidence) || Math.abs(a.x - b.x) < .03) {
      return { state: 'unavailable', intensity: 0 };
    }
    const angle = Math.atan2((b.y - a.y) * frame.imageHeight,
      Math.abs(b.x - a.x) * frame.imageWidth) * 180 / Math.PI * (shoulderSettings.mirrorDirection ? -1 : 1);
    const elapsed = this.lastTime === null ? Infinity : frame.timestampMs - this.lastTime;
    if (this.lastTime !== null && (elapsed < 0 || elapsed >= 1000)) {
      this.reset();
      this.state = this.candidate = 'unavailable';
    }
    this.angleDegrees += (angle - this.angleDegrees) * (this.lastTime === null ? 1 :
      1 - Math.exp(-Math.max(0, elapsed) / shoulderSettings.smoothingMs));
    this.lastTime = frame.timestampMs;
    const magnitude = Math.abs(this.angleDegrees);
    let next = this.state;
    if (magnitude <= shoulderSettings.exitDegrees) next = 'neutral';
    else if (magnitude >= shoulderSettings.enterDegrees) next = this.angleDegrees < 0 ? 'left' : 'right';
    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = frame.timestampMs;
    }
    if (frame.timestampMs - this.candidateSince >= shoulderSettings.settleMs) this.state = next;
    return {
      state: this.state,
      intensity: this.state === 'neutral' ? 0 : Math.max(0, Math.min(1,
        (magnitude - shoulderSettings.enterDegrees) / (shoulderSettings.maximumDegrees - shoulderSettings.enterDegrees)))
    };
  }
}
