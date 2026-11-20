import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandLandmark = { x: number; y: number; z: number };
export type Handedness = 'Left' | 'Right' | 'Unknown';
export type DetectedHand = { landmarks: HandLandmark[]; score: number; handedness?: Handedness };

/**
 * Lazy, renderer-only wrapper around MediaPipe Hand Landmarker.
 * The caller owns the video element; this class never opens a camera or sends frames anywhere.
 */
export class HandLandmarkerService {
  private landmarker: HandLandmarker | null = null;
  private initializing: Promise<void> | null = null;
  private lastVideoTime = -1;
  private generation = 0;
  private lastDetectionTime = -Infinity;

  constructor(private readonly wasmRoot: string, private readonly modelAssetPath: string) {}

  async initialize(): Promise<void> {
    if (this.landmarker) return;
    if (this.initializing) return this.initializing;

    const generation = this.generation;
    this.initializing = (async () => {
      const vision = await FilesetResolver.forVisionTasks(this.wasmRoot);
      const model = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this.modelAssetPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5
      });
      if (generation !== this.generation) model.close(); else this.landmarker = model;
    })().finally(() => { this.initializing = null; });

    return this.initializing;
  }

  /** Returns null when the video has not produced a new frame yet. */
  detect(video: HTMLVideoElement, timestampMs: number): DetectedHand[] | null {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === this.lastVideoTime) return null;
    if (timestampMs - this.lastDetectionTime < 1000 / 12) return null;
    this.lastDetectionTime = timestampMs;
    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return result.landmarks.map((landmarks, index) => ({
      landmarks,
      handedness: (result.handednesses[index]?.[0]?.categoryName ?? 'Unknown') as Handedness,
      score: result.handednesses[index]?.[0]?.score ?? 0
    })).filter(hand => hand.landmarks.length >= 18 && hand.score >= 0.45);
  }

  close(): void {
    this.generation++;
    this.lastDetectionTime = -Infinity;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
