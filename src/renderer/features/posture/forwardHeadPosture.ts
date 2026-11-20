import type { PoseFrame, PostureLandmark } from './detector.ts';

export interface FowardHeadPostureOptions {
  minScale?: number;
  maxScale?: number;
  minLandmarkConfidence?: number;
  calibrationFrames?: number;
  smoothingMs?: number;
}

/** Estimates relative camera distance from shoulder width. */
export class FowardHeadPosture {
  scale = 1;

  private baselineWidth: number | null = null;
  private calibrationSamples: number[] = [];
  private lastTimestamp: number | null = null;

  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly minConfidence: number;
  private readonly calibrationFrames: number;
  private readonly smoothingMs: number;

  constructor(options: FowardHeadPostureOptions = {}) {
    this.minScale = options.minScale ?? 0.65;
    this.maxScale = options.maxScale ?? 2;
    this.minConfidence = options.minLandmarkConfidence ?? 0.2;
    this.calibrationFrames = options.calibrationFrames ?? 12;
    this.smoothingMs = options.smoothingMs ?? 180;
  }

  reset(): void {
    this.scale = 1;
    this.baselineWidth = null;
    this.calibrationSamples = [];
    this.lastTimestamp = null;
  }

  /** Checks whether a landmark is reliable enough. */
  private isReliable(p?: PostureLandmark): p is PostureLandmark {
    if (!p) return false;

    return (
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Number.isFinite(p.visibility ?? 1) &&
      Number.isFinite(p.presence ?? 1) &&
      (p.visibility ?? 1) >= this.minConfidence &&
      (p.presence ?? 1) >= this.minConfidence
    );
  }

  /** Measures the normalized distance between both shoulders. */
  private measureShoulderWidth(frame: PoseFrame): number | null {
    const left = frame.landmarks[11];
    const right = frame.landmarks[12];

    if (!this.isReliable(left) || !this.isReliable(right)) {
      return null;
    }

    if (
      !Number.isFinite(frame.imageWidth) ||
      !Number.isFinite(frame.imageHeight) ||
      frame.imageWidth <= 0 ||
      frame.imageHeight <= 0
    ) {
      return null;
    }

    const dx = (right.x - left.x) * frame.imageWidth;
    const dy = (right.y - left.y) * frame.imageHeight;

    const width = Math.sqrt(dx * dx + dy * dy) / frame.imageWidth;

    if (!Number.isFinite(width) || width < 0.015) {
      return null;
    }

    return width;
  }

  /** Returns the median of the calibration samples. */
  private getMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;
  }

  /** Updates character scale using the current pose frame. */
  update(frame: PoseFrame): number {
    if (!Number.isFinite(frame.timestampMs)) {
      return this.scale;
    }

    const shoulderWidth = this.measureShoulderWidth(frame);

    if (shoulderWidth === null) {
      if(this.lastTimestamp!==null && frame.timestampMs-this.lastTimestamp>=1000)this.reset();
      return this.scale;
    }

    if(this.lastTimestamp!==null && (frame.timestampMs<this.lastTimestamp || frame.timestampMs-this.lastTimestamp>=1000))this.reset();
    const elapsed = this.lastTimestamp === null
      ? 1000 / 12
      : Math.max(0, frame.timestampMs - this.lastTimestamp);

    this.lastTimestamp = frame.timestampMs;

    // Establish the initial shoulder width.
    if (this.baselineWidth === null) {
      this.calibrationSamples.push(shoulderWidth);

      if (this.calibrationSamples.length >= this.calibrationFrames) {
        this.baselineWidth = this.getMedian(this.calibrationSamples);
        this.calibrationSamples = [];
      }

      this.scale = 1;
      return this.scale;
    }

    const ratio = shoulderWidth / this.baselineWidth;

    const targetScale = Math.max(
      this.minScale,
      Math.min(this.maxScale, ratio)
    );

    // Smooth scale changes between frames.
    const delta = Math.min(elapsed, 250);
    const alpha = 1 - Math.exp(-delta / this.smoothingMs);

    this.scale += (targetScale - this.scale) * alpha;

    return this.scale;
  }
}
