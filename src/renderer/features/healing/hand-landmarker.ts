import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandLandmark = { x: number; y: number; z: number };
export type DetectedHand = { landmarks: HandLandmark[]; score: number };

/**
 * Lazy, renderer-only wrapper around MediaPipe Hand Landmarker.
 * The caller owns the video element; this class never opens a camera or sends frames anywhere.
 */
export class HandLandmarkerService {
  private landmarker: HandLandmarker | null = null;
  private initializing: Promise<void> | null = null;
  private lastVideoTime = -1;

  constructor(private readonly wasmRoot: string, private readonly modelAssetPath: string) {}

  async initialize(): Promise<void> {
    if (this.landmarker) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      const vision = await FilesetResolver.forVisionTasks(this.wasmRoot);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this.modelAssetPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5
      });
    })().finally(() => { this.initializing = null; });

    return this.initializing;
  }

  /** Returns null when the video has not produced a new frame yet. */
  detect(video: HTMLVideoElement, timestampMs: number): DetectedHand[] | null {
    if (!this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return result.landmarks.map((landmarks, index) => ({
      landmarks,
      score: result.handednesses[index]?.[0]?.score ?? 0
    })).filter(hand => hand.landmarks.length >= 9 && hand.score >= 0.45);
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}
