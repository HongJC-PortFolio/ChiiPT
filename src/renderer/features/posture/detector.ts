import type { PoseWorkerRequest, PoseWorkerResponse } from './worker-protocol.ts';
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

/** Owns frame transport only; MediaPipe runs exclusively in pose.worker.ts. */
export class Detector {
  private options: PostureDetectorOptions;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private generation = 0;
  private raf = 0;
  private busy = false;
  private ready = false;
  private lastVideoTime = -1;
  private lastSent = -Infinity;
  private watchdog = 0;

  constructor(options: PostureDetectorOptions) { this.options = options; }

  start(stream: MediaStream): void {
    if (this.stream === stream && this.video) return;
    this.stop();
    if (!stream.getVideoTracks().some(t => t.readyState === 'live')) {
      this.fail(new Error('사용 가능한 카메라 영상 트랙이 없습니다.'));
      return;
    }
    const generation = this.generation;
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    video.srcObject = stream;
    this.stream = stream; this.video = video;
    document.body.append(video);
    try {
      // Classic worker permits MediaPipe's WASM loader to use importScripts.
      const worker = new Worker(new URL('/assets/pose.worker.js', location.href), { name: 'chiipt-pose' });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
        if (generation !== this.generation) return;
        clearTimeout(this.watchdog);
        const message = event.data;
        if (message.type === 'error') { this.fail(new Error(message.message)); return; }
        if (message.type === 'ready') this.ready = true;
        else {
          this.busy = false;
          try { this.options.onResults(message.frame); } catch (error) { this.fail(error); }
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (generation === this.generation) this.fail(new Error(event.message || 'Pose worker failed'));
      };
      worker.onmessageerror = () => {
        if (generation === this.generation) this.fail(new Error('Pose worker message decoding failed'));
      };
      const { onResults: _onResults, onError: _onError, ...options } = this.options;
      worker.postMessage({ type: 'init', options } satisfies PoseWorkerRequest);
      this.armTimeout(30000);
      void video.play().then(() => {
        if (generation === this.generation) this.raf = requestAnimationFrame(this.tick);
      }).catch(error => { if (generation === this.generation) this.fail(error); });
    } catch (error) { this.fail(error); }
  }

  private tick = (now: number): void => {
    const video = this.video, worker = this.worker;
    if (!video || !worker) return;
    this.raf = requestAnimationFrame(this.tick);
    if (!this.ready || this.busy || video.readyState < 2 || !video.videoWidth || !video.videoHeight ||
      video.currentTime === this.lastVideoTime || now - this.lastSent < 1000 / Math.max(1, Math.min(30, this.options.maxFps ?? 12))) return;
    this.busy = true; // Includes bitmap creation: at most one frame in flight.
    this.lastSent = now; this.lastVideoTime = video.currentTime;
    const generation = this.generation;
    const scale = Math.min(1, Math.max(256, Math.min(1280, this.options.maxFrameDimension ?? 640)) / Math.max(video.videoWidth, video.videoHeight));
    this.armTimeout(5000);
    void createImageBitmap(video, { resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
      resizeHeight: Math.max(1, Math.round(video.videoHeight * scale)) }).then(bitmap => {
      if (generation !== this.generation) { bitmap.close(); return; }
      try { worker.postMessage({ type: 'frame', bitmap, timestampMs: now } satisfies PoseWorkerRequest, [bitmap]); }
      catch (error) { bitmap.close(); this.fail(error); }
    }).catch(error => { if (generation === this.generation) this.fail(error); });
  };

  private armTimeout(ms: number): void {
    clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => this.fail(new Error('Pose worker response timeout')), ms);
  }
  private fail(error: unknown): void {
    this.stop();
    const normalized = error instanceof Error ? error : new Error(String(error));
    console.error('[Detector]', normalized);
    this.options.onError?.(normalized);
  }
  stop(): void {
    this.generation++;
    cancelAnimationFrame(this.raf); clearTimeout(this.watchdog);
    this.worker?.terminate(); this.worker = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video.remove(); }
    this.video = null; this.stream = null;
    this.ready = false; this.busy = false; this.lastVideoTime = -1; this.lastSent = -Infinity;
    // Shared stream tracks remain owned by CameraManager.
  }
}
