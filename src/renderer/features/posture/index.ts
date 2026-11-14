
import { Detector } from './detector.ts';
import type { FeatureModule, PostureResult } from '../../shared/types/index.ts';

const WASM_ROOT = new URL('./assets/mediapipe/wasm', window.location.href).href;
const MODEL_ASSET_PATH = new URL('./assets/models/pose_landmarker_lite.task', window.location.href).href;

/** Creates the posture feature using the shared camera stream. */
export function createPostureFeature(emit: (result: PostureResult) => void): FeatureModule {
  let detector: Detector | null = null;
  let currentStream: MediaStream | null = null;
  let lastLogTime = 0;

  return {
    id: 'posture',

    start(stream: MediaStream): void {
      if (currentStream === stream && detector) return;

      detector?.stop();
      detector = null;
      currentStream = stream;
      lastLogTime = 0;

      console.log('[Posture] Detection started');
      console.log('[Posture] WASM path:', WASM_ROOT);
      console.log('[Posture] Model path:', MODEL_ASSET_PATH);

      try {
        const instance = new Detector({
          wasmRoot: WASM_ROOT,
          modelAssetPath: MODEL_ASSET_PATH,
          maxFps: 12,
          maxFrameDimension: 640,
          minLandmarkConfidence: 0.5,
          minDetectionConfidence: 0.5,
          minPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          delegate: 'CPU',

          onResults: (frame) => {
            if (performance.now() - lastLogTime >= 1000) {
              lastLogTime = performance.now();

              console.log('[Posture] Detection result:', {
                hasPose: frame.hasPose,
                hasUpperBody: frame.hasUpperBody,
                landmarkCount: frame.landmarks.length,
                imageWidth: frame.imageWidth,
                imageHeight: frame.imageHeight
              });
            }

            const result: PostureResult = {
              state: frame.hasUpperBody ? 'neutral' : 'unavailable',
              intensity: 0
            };

            emit(result);
          },

          onError: (error) => {
            console.error('[Posture] Detection error:', error);

            detector = null;
            currentStream = null;

            emit({
              state: 'unavailable',
              intensity: 0
            });
          }
        });

        detector = instance;
        instance.start(stream);

        console.log('[Posture] Detector connected to camera stream');
      } catch (error) {
        console.error('[Posture] Initialization error:', error);

        detector?.stop();
        detector = null;
        currentStream = null;

        emit({
          state: 'unavailable',
          intensity: 0
        });
      }
    },

    stop(): void {
      detector?.stop();

      detector = null;
      currentStream = null;
      lastLogTime = 0;

      console.log('[Posture] Detection stopped');
    }
  };
}
