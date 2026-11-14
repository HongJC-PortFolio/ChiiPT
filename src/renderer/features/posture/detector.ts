
import {
  FilesetResolver,
  PoseLandmarker
} from '@mediapipe/tasks-vision';

// temporary test (disabled)
// console.log('[Detector][MODULE TEST] detector.ts loaded');

export interface PostureLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface PoseFrame {
  timestampMs: number;
  imageWidth: number;
  imageHeight: number;
  hasPose: boolean;
  hasUpperBody: boolean;
  landmarks: PostureLandmark[];
  worldLandmarks: PostureLandmark[];
}

export interface PostureDetectorOptions {
  wasmRoot: string;
  modelAssetPath: string;
  maxFps?: number;
  maxFrameDimension?: number;
  minLandmarkConfidence?: number;
  delegate?: 'CPU' | 'GPU';
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
  onResults: (frame: PoseFrame) => void;
  onError?: (error: Error) => void;
}

const LANDMARK = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12
} as const;

function copyLandmarks(
  points: readonly {
    x: number;
    y: number;
    z: number;
    visibility?: number;
    presence?: number;
  }[] | undefined
): PostureLandmark[] {
  return (points ?? []).map(point => ({
    x: point.x,
    y: point.y,
    z: point.z,
    ...(point.visibility !== undefined ? { visibility: point.visibility } : {}),
    ...(point.presence !== undefined ? { presence: point.presence } : {})
  }));
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Detects upper-body landmarks using the shared camera stream. */
export class Detector {
  private options: PostureDetectorOptions;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private landmarker: PoseLandmarker | null = null;
  private animationFrameId: number | null = null;
  private generation = 0;
  private lastVideoTime = -1;
  private lastDetectionTime = -Infinity;
  private lastTimestampMs = -1;

  constructor(options: PostureDetectorOptions) {
    this.options = options;

    // temporary test (disabled)
    // console.log('[Detector][TEST 1] 객체 생성 완료');
    // console.log('[Detector] WASM:', options.wasmRoot);
    // console.log('[Detector] Model:', options.modelAssetPath);
  }

  start(stream: MediaStream): void {
    if (this.stream === stream && this.video) return;

    this.stop();

    const track = stream.getVideoTracks().find(
      track => track.readyState === 'live'
    );

    if (!track) {
      this.notifyError(
        new Error('사용 가능한 카메라 영상 트랙이 없습니다.')
      );
      return;
    }

    // temporary test (disabled)
    // console.log('[Detector][TEST 2] start() 실행');
    // console.log('[Detector] Stream:', stream);
    // console.log('[Detector] Stream active:', stream.active);
    // console.log('[Detector][TEST 3] 카메라 트랙 확인 완료', track.getSettings());

    const generation = this.generation;
    const video = document.createElement('video');

    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');

    Object.assign(video.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none'
    });

    video.srcObject = stream;

    this.stream = stream;
    this.video = video;

    (document.body ?? document.documentElement).append(video);

    void this.initialize(stream, video, generation).catch(error => {
      this.handleError(error, generation, stream);
    });
  }

  private async initialize(
    stream: MediaStream,
    video: HTMLVideoElement,
    generation: number
  ): Promise<void> {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D Context를 생성할 수 없습니다.');
    }

    this.canvas = canvas;
    this.context = context;

    // temporary test (disabled)
    // console.log('[Detector][TEST 4] MediaPipe 초기화 시작');
    // console.log('[Detector][TEST 5] WASM 로딩 시작');

    const [fileset] = await Promise.all([
      FilesetResolver.forVisionTasks(this.options.wasmRoot),
      video.play()
    ]);

    if (!this.isCurrent(generation, stream)) return;

    // temporary test (disabled)
    // console.log('[Detector][TEST 6] WASM 로딩 성공');
    // console.log('[Detector][TEST 7] 비디오 재생 성공');
    // console.log('[Detector] Video resolution:', video.videoWidth, video.videoHeight);
    // console.log('[Detector][TEST 8] 모델 로딩 시작');

    const landmarker = await PoseLandmarker.createFromOptions(
      fileset,
      {
        baseOptions: {
          modelAssetPath: this.options.modelAssetPath,
          delegate: this.options.delegate ?? 'CPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: this.options.minDetectionConfidence ?? 0.5,
        minPosePresenceConfidence: this.options.minPresenceConfidence ?? 0.5,
        minTrackingConfidence: this.options.minTrackingConfidence ?? 0.5,
        outputSegmentationMasks: false
      }
    );

    if (!this.isCurrent(generation, stream)) {
      landmarker.close();
      return;
    }

    this.landmarker = landmarker;

    // temporary test (disabled)
    // console.log('[Detector][TEST 9] 모델 로딩 완료');

    this.animationFrameId = requestAnimationFrame(this.processFrame);
  }

  private processFrame = (now: number): void => {
    const generation = this.generation;
    const stream = this.stream;
    const video = this.video;
    const canvas = this.canvas;
    const context = this.context;
    const landmarker = this.landmarker;

    if (!stream || !video || !canvas || !context || !landmarker) return;

    // temporary test (disabled)
    // console.log('[Detector][TEST 10] 프레임 루프 시작');

    const ready =
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;

    const maxDimension = Math.max(
      256,
      Math.min(1280, this.options.maxFrameDimension ?? 640)
    );

    const maxFps = Math.max(
      1,
      Math.min(30, this.options.maxFps ?? 12)
    );

    const interval = 1000 / maxFps;

    if (
      ready &&
      video.currentTime !== this.lastVideoTime &&
      now - this.lastDetectionTime >= interval
    ) {
      this.lastVideoTime = video.currentTime;
      this.lastDetectionTime = now;

      try {
        const scale = Math.min(
          1,
          maxDimension / Math.max(video.videoWidth, video.videoHeight)
        );

        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        context.drawImage(video, 0, 0, width, height);

        const timestampMs = Math.max(
          now,
          this.lastTimestampMs + 0.001
        );

        this.lastTimestampMs = timestampMs;

        // temporary test (disabled)
        // console.log('[Detector][TEST 11] detectForVideo 호출', { width, height });

        landmarker.detectForVideo(
          canvas,
          timestampMs,
          result => {
            if (!this.isCurrent(generation, stream)) return;

            const landmarks = copyLandmarks(result.landmarks[0]);
            const worldLandmarks = copyLandmarks(result.worldLandmarks[0]);

            const frame: PoseFrame = {
              timestampMs,
              imageWidth: width,
              imageHeight: height,
              hasPose: landmarks.length > 0,
              hasUpperBody: this.isUpperBodyVisible(landmarks),
              landmarks,
              worldLandmarks
            };

            // temporary test (disabled)
            // console.log('[Detector][TEST 12] 사람 감지:', frame.hasPose);
            // console.log('[Detector][TEST 12] 상체 감지:', frame.hasUpperBody);
            // console.log('[Detector][TEST 12] 랜드마크:', frame.landmarks.length);
            // console.log('[Detector][TEST 12] 데이터:', frame.landmarks);

            try {
              this.options.onResults(frame);
            } catch (error) {
              this.notifyError(error);
            }
          }
        );
      } catch (error) {
        this.handleError(error, generation, stream);
        return;
      }
    }

    if (this.isCurrent(generation, stream)) {
      this.animationFrameId = requestAnimationFrame(this.processFrame);
    }
  };

  /** Checks whether a landmark is reliable enough to analyze. */
  private isVisible(point?: PostureLandmark): boolean {
    if (!point) return false;

    const threshold = this.options.minLandmarkConfidence ?? 0.5;

    const scores = [
      point.visibility,
      point.presence
    ].filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value)
    );

    return (
      scores.length > 0 &&
      scores.every(score => score >= threshold)
    );
  }

  /** Requires a visible head landmark and both shoulders. */
  private isUpperBodyVisible(landmarks: PostureLandmark[]): boolean {
    const headVisible = [
      landmarks[LANDMARK.nose],
      landmarks[LANDMARK.leftEar],
      landmarks[LANDMARK.rightEar]
    ].some(point => this.isVisible(point));

    const leftShoulder = this.isVisible(
      landmarks[LANDMARK.leftShoulder]
    );

    const rightShoulder = this.isVisible(
      landmarks[LANDMARK.rightShoulder]
    );

    return headVisible && leftShoulder && rightShoulder;
  }

  private isCurrent(generation: number, stream: MediaStream): boolean {
    return this.generation === generation && this.stream === stream;
  }

  private handleError(
    error: unknown,
    generation: number,
    stream: MediaStream
  ): void {
    if (!this.isCurrent(generation, stream)) return;

    this.stop();
    this.notifyError(error);
  }

  private notifyError(error: unknown): void {
    const normalized = normalizeError(error);

    console.error('[Detector] Detection error:', normalized);

    if (this.options.onError) {
      try {
        this.options.onError(normalized);
      } catch (callbackError) {
        console.error('[Detector] Error callback failed:', callbackError);
      }
    }
  }

  stop(): void {
    this.generation++;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }

    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas = null;
    }

    this.context = null;

    // CameraManager owns the shared stream.
    // This class must never stop shared camera tracks.
    this.stream = null;

    this.lastVideoTime = -1;
    this.lastDetectionTime = -Infinity;
    this.lastTimestampMs = -1;

    // temporary test (disabled)
    // console.log('[Detector] stop() 실행');
  }
}
