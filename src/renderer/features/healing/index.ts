import type { FeatureModule, HealingResult } from '../../shared/types/index.ts';
import { PetReactions } from './PetReactions.ts';
import { PettingOverlay } from './PettingOverlay.ts';
import { WalkFeature } from './walk/WalkFeature.ts';
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
 * index-finger movement. A normalized camera point is mapped into the moving
 * camera guide, and only the character's head guide can start a petting gesture.
 */
export function createHealingFeature(emitResult: (result: HealingResult) => void): FeatureModule {
  // 쓰다듬기 연출(부비부비/웃음/총총). 인식 결과가 나갈 때 함께 알려 준다.
  const reactions = new PetReactions();
  const overlay = new PettingOverlay();
  // 산책(마우스를 따라 걷기): 카메라와 상관없이 앱이 시작될 때 한 번 준비한다. 우클릭 메뉴의 '산책'으로 켜고 끈다.
  new WalkFeature().attach();
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
  let lastHandPoint: { x: number; y: number } | null = null;

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

  const resetGesture = (state: HealingResult['state'] = 'idle'): void => {
    enteredAt = 0;
    strokeStartX = null;
    lastObservedX = null;
    firstStrokeDirection = 0;
    completedReverseStroke = false;
    lastMovementAt = 0;
    petting = false;
    report(state);
  };

  const findHandPoint = (hands: DetectedHand[]): { x: number; y: number } | null => {
    for (const hand of hands) {
      // The index tip is the visible hand cursor and the contact point used for
      // the head-only hit test. This makes the blue guide predictable to use.
      const indexTip = hand.landmarks[8];
      if (indexTip) return { x: indexTip.x, y: indexTip.y };
    }
    return null;
  };

  const processFrame = (currentGeneration: number): void => {
    if (currentGeneration !== generation || !detector || !video) return;
    const now = performance.now();
    const hands = detector.detect(video, now);
    if (hands !== null) {
      lastHandPoint = findHandPoint(hands);
      const hit = overlay.update(lastHandPoint);
      if (!lastHandPoint || !hit.inCameraGuide) {
        resetGesture();
      } else if (!hit.inHeadGuide) {
        // A hand outside the blue head guide remains visible but cannot carry
        // over a partially completed stroke into the head area.
        resetGesture('hand-detected');
      } else {
        const handPoint = lastHandPoint;
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
    } else {
      // Render at display refresh rate so the guides follow walking and reaction
      // transforms even when the next camera frame has not arrived yet.
      overlay.update(lastHandPoint);
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
      lastHandPoint = null;
      // Show the temporary pink/blue calibration guides as soon as the camera
      // feature starts, rather than waiting for the model to finish loading.
      overlay.update(null);
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
      lastHandPoint = null;
      overlay.hide();
      detector?.close();
      detector = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
        video = null;
      }
    },
    dispose(): void {
      overlay.destroy();
    }
  };
}
