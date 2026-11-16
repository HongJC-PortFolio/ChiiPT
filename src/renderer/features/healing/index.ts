import type { FeatureModule, HealingResult } from '../../shared/types/index.ts';
import { PetReactions } from './PetReactions.ts';
import { HandLandmarkerService, type DetectedHand } from './hand-landmarker.ts';

const WASM_ROOT = new URL('../../assets/mediapipe/wasm', window.location.href).href;
const MODEL_ASSET_PATH = new URL('../../assets/models/hand_landmarker.task', window.location.href).href;
// Normalized camera coordinates: roughly 19px horizontally in a 640px frame.
// One full stroke must be followed by a same-sized stroke in the opposite direction.
const PETTING_MIN_DURATION_MS = 120;
const STROKE_MIN_DISTANCE = 0.03;
const MOVEMENT_NOISE_THRESHOLD = 0.004;
const PETTING_STOP_TIMEOUT_MS = 400;

/**
 * Consumes the common camera stream and recognizes deliberate back-and-forth
 * index-finger movement. Character placement is intentionally not part of
 * the initial gesture threshold, so interaction works without camera-to-screen calibration.
 */
export function createHealingFeature(emitResult: (result: HealingResult) => void): FeatureModule {
  // 쓰다듬기 연출(부비부비/웃음/총총). 인식 결과가 나갈 때 함께 알려 준다.
  const reactions = new PetReactions();
  const emit = (result: HealingResult): void => {
    reactions.setPetting(result.state === 'petting');
    emitResult(result);
  };
  let detector: HandLandmarkerService | null = null;
  let video: HTMLVideoElement | null = null;
  let animationFrame: number | null = null;
  let generation = 0;
  let enteredAt = 0;
  let strokeStartX: number | null = null;
  let lastObservedX: number | null = null;
  let firstStrokeDirection = 0;
  let completedReverseStroke = false;
  let lastMovementAt = 0;
  let petting = false;
  let reportedState: HealingResult['state'] = 'idle';

  const report = (state: HealingResult['state']): void => {
    if (reportedState === state) return;
    reportedState = state;
    emit({ state });
  };

  const reportError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    reportedState = 'error';
    emit({ state: 'error', message: message.slice(0, 160) });
  };

  const resetGesture = (): void => {
    enteredAt = 0;
    strokeStartX = null;
    lastObservedX = null;
    firstStrokeDirection = 0;
    completedReverseStroke = false;
    lastMovementAt = 0;
    report('idle');
    petting = false;
  };

  const findHandPoint = (hands: DetectedHand[]): { x: number; y: number } | null => {
    for (const hand of hands) {
      // Average the wrist, index tip, and middle-finger tip. This stays usable
      // when one fingertip is briefly occluded during a natural petting motion.
      const points = [hand.landmarks[0], hand.landmarks[8], hand.landmarks[12]].filter(
        (point): point is { x: number; y: number; z: number } => point !== undefined
      );
      if (points.length > 0) {
        return {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length
        };
      }
    }
    return null;
  };

  const processFrame = (currentGeneration: number): void => {
    if (currentGeneration !== generation || !detector || !video) return;
    const now = performance.now();
    const hands = detector.detect(video, now);
    if (hands) {
      const handPoint = findHandPoint(hands);
      if (!handPoint) {
        resetGesture();
      } else {
        if (!enteredAt) {
          enteredAt = now;
          lastMovementAt = now;
          lastObservedX = handPoint.x;
          report('hand-detected');
        }
        if (strokeStartX === null) strokeStartX = handPoint.x;
        const strokeDistance = handPoint.x - strokeStartX;
        if (lastObservedX !== null && Math.abs(handPoint.x - lastObservedX) >= MOVEMENT_NOISE_THRESHOLD) {
          lastMovementAt = now;
        }
        lastObservedX = handPoint.x;

        if (petting && now - lastMovementAt >= PETTING_STOP_TIMEOUT_MS) {
          petting = false;
          firstStrokeDirection = 0;
          completedReverseStroke = false;
          strokeStartX = handPoint.x;
          report('hand-detected');
        }

        if (Math.abs(strokeDistance) >= STROKE_MIN_DISTANCE) {
          const direction = Math.sign(strokeDistance);
          if (firstStrokeDirection === 0) {
            firstStrokeDirection = direction;
            strokeStartX = handPoint.x;
          } else if (direction !== firstStrokeDirection) {
            completedReverseStroke = true;
          }
          if (completedReverseStroke) strokeStartX = handPoint.x;
        }
        if (
          !petting
          && now - enteredAt >= PETTING_MIN_DURATION_MS
          && completedReverseStroke
        ) {
          petting = true;
          report('petting');
        }
      }
      if (!handPoint && hands.length > 0) report('hand-detected');
    }
    animationFrame = requestAnimationFrame(() => processFrame(currentGeneration));
  };

  return {
    id: 'healing',
    start(stream: MediaStream): void {
      if (video?.srcObject === stream) return;
      this.stop();
      reactions.attach();
      const currentGeneration = generation;
      const element = document.createElement('video');
      element.autoplay = true;
      element.muted = true;
      element.playsInline = true;
      element.srcObject = stream;
      Object.assign(element.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
      document.body.append(element);
      video = element;
      detector = new HandLandmarkerService(WASM_ROOT, MODEL_ASSET_PATH);
      reportedState = 'idle';
      void (async () => {
        try {
          await Promise.all([detector?.initialize(), element.play()]);
          if (currentGeneration === generation && video === element) processFrame(currentGeneration);
        } catch (error) {
          console.error('[Healing] Hand Landmarker initialization failed:', error);
          resetGesture();
          reportError(error);
        }
      })();
    },
    stop(): void {
      reactions.detach();
      generation++;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      resetGesture();
      detector?.close();
      detector = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
        video = null;
      }
    }
  };
}
