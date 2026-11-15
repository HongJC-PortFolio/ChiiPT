import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseWorkerRequest, PoseWorkerResponse } from './worker-protocol.ts';
import type { PostureLandmark } from './detector.ts';

// A narrow worker scope avoids mixing DOM and WebWorker lib declarations.
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<PoseWorkerRequest>) => void;
  postMessage(message: PoseWorkerResponse): void;
};
let model: PoseLandmarker | null = null;
let confidence = .5;
function visible(p?: PostureLandmark): boolean {
  if (!p) return false;
  const scores = [p.visibility, p.presence].filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return scores.length > 0 && scores.every(n => n >= confidence);
}
scope.onmessage = event => { void handle(event.data).catch(error => {
  scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}); };
async function handle(message: PoseWorkerRequest): Promise<void> {
  if (message.type === 'init') {
    const o = message.options;
    confidence = o.minLandmarkConfidence ?? .5;
    const fileset = await FilesetResolver.forVisionTasks(o.wasmRoot);
    model = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelAssetPath, delegate: o.delegate ?? 'CPU' },
      canvas: new OffscreenCanvas(1, 1),
      runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
      minPoseDetectionConfidence: o.minDetectionConfidence ?? .5,
      minPosePresenceConfidence: o.minPresenceConfidence ?? .5,
      minTrackingConfidence: o.minTrackingConfidence ?? .5
    });
    scope.postMessage({ type: 'ready' });
    return;
  }
  const { bitmap, timestampMs } = message;
  try {
    if (!model) throw new Error('Pose worker is not initialized');
    model.detectForVideo(bitmap, timestampMs, result => {
      const landmarks = (result.landmarks[0] ?? []).map(p => ({ ...p }));
      const worldLandmarks = (result.worldLandmarks[0] ?? []).map(p => ({ ...p }));
      scope.postMessage({ type: 'result', frame: {
        timestampMs, imageWidth: bitmap.width, imageHeight: bitmap.height,
        hasPose: landmarks.length > 0,
        hasUpperBody: [landmarks[0], landmarks[7], landmarks[8]].some(visible) && visible(landmarks[11]) && visible(landmarks[12]),
        landmarks, worldLandmarks
      } });
    });
  } finally { bitmap.close(); }
}
