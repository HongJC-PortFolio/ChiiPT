
import { Detector } from './detector.ts';
import { ShoulderPosture } from './ShoulderPosture.ts';
import { FowardHeadPosture } from './forwardHeadPosture.ts';
import type {
  FeatureModule,
  PostureResult
} from '../../shared/types/index.ts';

const WASM_ROOT = new URL(
  './assets/mediapipe/wasm',
  window.location.href
).href;

const MODEL_ASSET_PATH = new URL(
  './assets/models/pose_landmarker_lite.task',
  window.location.href
).href;

/** Creates the posture feature using the shared camera stream. */
export function createPostureFeature(
  emit: (result: PostureResult) => void,
  onScale?: (scale: number) => void
): FeatureModule {
  let detector: Detector | null = null;
  let currentStream: MediaStream | null = null;
  let lastLogTime = 0;

  const shoulders = new ShoulderPosture();

  const forwardHeadPosture = new FowardHeadPosture({
    minScale: 0.65,
    maxScale: 2,
    minLandmarkConfidence: 0.2,
    calibrationFrames: 12,
    smoothingMs: 180
  });

  return {
    id: 'posture',

    start(stream: MediaStream): void {
      if (currentStream === stream && detector) return;

      detector?.stop();
      detector = null;
      currentStream = stream;
      lastLogTime = 0;

      shoulders.reset();
      forwardHeadPosture.reset();
      onScale?.(1);

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
            const result = shoulders.update(frame);
            const scale = forwardHeadPosture.update(frame);

            onScale?.(scale);

            if (performance.now() - lastLogTime >= 1000) {
              lastLogTime = performance.now();

              console.log('[Posture] Detection result:', {
                hasPose: frame.hasPose,
                hasUpperBody: frame.hasUpperBody,
                landmarkCount: frame.landmarks.length,
                imageWidth: frame.imageWidth,
                imageHeight: frame.imageHeight,
                shoulderAngleDegrees: shoulders.angleDegrees,
                state: result.state,
                intensity: result.intensity,
                characterScale: scale
              });
            }

            emit(result);
          },

          onError: (error) => {
            console.error('[Posture] Detection error:', error);

            detector = null;
            currentStream = null;

            shoulders.reset();
            forwardHeadPosture.reset();
            onScale?.(1);

            emit({
              state: 'unavailable',
              intensity: 0
            });
          }
        });

        detector = instance;
        instance.start(stream);

        console.log(
          '[Posture] Detector connected to camera stream'
        );
      } catch (error) {
        console.error(
          '[Posture] Initialization error:',
          error
        );

        detector?.stop();
        detector = null;
        currentStream = null;

        shoulders.reset();
        forwardHeadPosture.reset();
        onScale?.(1);

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

      shoulders.reset();
      forwardHeadPosture.reset();
      onScale?.(1);

      console.log('[Posture] Detection stopped');
    }
  };
}
