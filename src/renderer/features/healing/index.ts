import { CheekPinchReaction } from './CheekPinchReaction.ts';
import { recognizeSidewaysPinch } from './pinch-recognition.ts';
import { PettingOverlay } from './PettingOverlay.ts';
import { PetReactions } from './PetReactions.ts';
import type { FeatureModule, HealingResult } from '../../shared/types/index.ts';
import { HandLandmarkerService, type DetectedHand } from './hand-landmarker.ts';

const WASM_ROOT = new URL('/assets/mediapipe/wasm', window.location.href).href;
const MODEL_ASSET_PATH = new URL('/assets/models/hand_landmarker.task', window.location.href).href;
// Normalized camera coordinates: roughly 19px horizontally in a 640px frame.
// One full stroke must be followed by a same-sized stroke in the opposite direction.
const PETTING_MIN_DURATION_MS = 120;
const STROKE_MIN_DISTANCE = 0.03;
const MOVEMENT_NOISE_THRESHOLD = 0.004;
const PETTING_STOP_TIMEOUT_MS = 400;

/**
 * Consumes the common camera stream and recognizes deliberate back-and-forth
 * index-finger movement. Only strokes inside the live character head region trigger reactions.
 */
export function createHealingFeature(emitResult: (result: HealingResult) => void): FeatureModule {
  const reactions = new PetReactions();
  const overlay = new PettingOverlay();
  const cheekPinch = new CheekPinchReaction();
  let pinchEnteredAt = 0, pinchSide = '', lastSampleAt = -Infinity;
  let interaction: {point:{x:number;y:number};pinching:boolean;leftHand:boolean;handedness?:DetectedHand['handedness']} | null = null;
  let lastHandPoint: {x:number;y:number} | null = null;
  const emit = (result: HealingResult): void => {
    emitResult(result);
    if(result.state==='pinching') { reactions.detach(); reactions.attach(); }
    reactions.setPetting(result.state === 'petting');
    cheekPinch.setPinching(result.state==='pinching',pinchSide==='left');
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

  const findInteraction = (hands: DetectedHand[]): typeof interaction => {
    for(const hand of hands) {
      const pinch=recognizeSidewaysPinch(hand.landmarks);
      if(pinch)return {point:pinch.point,pinching:true,leftHand:hand.handedness==='Left',handedness:hand.handedness};
    }
    for(const hand of hands) {
      const point=hand.landmarks[8];
      if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))return {point,pinching:false,leftHand:hand.handedness==='Left',handedness:hand.handedness};
    }
    return null;
  };

  const processFrame = (currentGeneration: number): void => {
    if (currentGeneration !== generation || !detector || !video) return;
    const now = performance.now();
    let hands: DetectedHand[] | null;
    try { hands = detector.detect(video, now); }
    catch (error) {
      detector.close(); reactions.detach(); overlay.hide(); cheekPinch.detach(); reportError(error); return;
    }
    if(hands!==null) {interaction=findInteraction(hands);lastSampleAt=now;}
    if(now-lastSampleAt>600)interaction=null;
    lastHandPoint=interaction?.point??null;
    const hit=overlay.update(lastHandPoint,interaction?.pinching,interaction?.leftHand);
    if(!hit.inCameraGuide) {
      pinchEnteredAt=0;pinchSide='';resetGesture();
    } else if(interaction?.pinching) {
      const side=interaction.handedness==='Left' ? (hit.inLeftPinchGuide?'left':'')
        : interaction.handedness==='Right' ? (hit.inRightPinchGuide?'right':'')
        : hit.inLeftPinchGuide?'left':hit.inRightPinchGuide?'right':'';
      if(!side) {pinchEnteredAt=0;pinchSide='';resetGesture('hand-detected');}
      else {
        if(side!==pinchSide || !pinchEnteredAt) {
          resetGesture('hand-detected');pinchSide=side;pinchEnteredAt=now;
        }
        if(hands!==null && now-pinchEnteredAt>=80)report('pinching');
      }
    } else {
      pinchEnteredAt=0;pinchSide='';
      if(reportedState==='pinching')resetGesture('hand-detected');
      if(!hit.inHeadGuide)resetGesture('hand-detected');
    }
    if (hands) {
      const handPoint = lastHandPoint;
      if (handPoint && hit.inHeadGuide && !interaction?.pinching) {
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
      const service = new HandLandmarkerService(WASM_ROOT, MODEL_ASSET_PATH);
      detector = service;
      reportedState = 'idle';
      void (async () => {
        try {
          await Promise.all([service.initialize(), element.play()]);
          if (currentGeneration === generation && video === element) processFrame(currentGeneration);
        } catch (error) {
          if (currentGeneration !== generation) return;
          service.close(); reactions.detach(); overlay.hide();
          console.error('[Healing] Hand Landmarker initialization failed:', error);
          resetGesture();
          reportError(error);
        }
      })();
    },
    stop(): void {
      generation++;
      interaction=null;pinchEnteredAt=0;pinchSide='';lastSampleAt=-Infinity;
      lastHandPoint = null;
      overlay.hide();
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      resetGesture();
      reactions.detach();
      cheekPinch.detach();
      detector?.close();
      detector = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
        video = null;
      }
    },
    dispose(): void { this.stop(); overlay.destroy(); }
  };
}
