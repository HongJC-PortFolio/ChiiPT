import { Detector } from '../src/renderer/features/posture/detector.ts';

export async function runProbe() {
  const originalRaf=window.requestAnimationFrame, originalCancel=window.cancelAnimationFrame;
  window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(performance.now()),16);
  window.cancelAnimationFrame=id=>window.clearTimeout(id);
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  const paint = () => { ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 320, 240); };
  paint();
  const stream = canvas.captureStream(12);
  const timer = setInterval(paint, 80);
  let timeout: ReturnType<typeof setTimeout>;
  let count = 0;
  let detector: Detector;
  try {
    return await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('MediaPipe inference timeout')), 30000);
      detector = new Detector({
        wasmRoot: new URL('/assets/mediapipe/wasm', location.href).href,
        modelAssetPath: new URL('/assets/models/pose_landmarker_lite.task', location.href).href,
        delegate: 'CPU', maxFps: 12,
        onResults(frame) {
          if (++count === 3) {
            detector.stop();
            if (stream.getVideoTracks()[0]?.readyState !== 'live') {
              reject(new Error('Detector stopped the shared camera track')); return;
            }
            setTimeout(() => {
              if (count !== 3) { reject(new Error('Results arrived after stop')); return; }
              detector.start(stream);
            }, 150);
          }
          if (count >= 6) resolve({ restarted: true, frames: count, width: frame.imageWidth, height: frame.imageHeight,
            hasPose: frame.hasPose, landmarks: frame.landmarks.length });
        },
        onError: reject
      });
      detector.start(stream);
      detector.stop(); // Cancel initialization before starting a fresh worker.
      detector.start(stream);
    });
  } finally {
    clearTimeout(timeout!); clearInterval(timer); detector!?.stop();
    stream.getTracks().forEach(track => track.stop()); window.requestAnimationFrame=originalRaf;window.cancelAnimationFrame=originalCancel;
  }
}
