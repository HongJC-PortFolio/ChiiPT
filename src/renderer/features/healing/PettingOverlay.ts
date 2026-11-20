import {
  cameraGuideRect,
  cheekPinchGuideRect,
  headGuideRect,
  isNormalizedPointVisible,
  keepPointInsideRect,
  mapHandToCameraGuide,
  pointInRect,
  visibleCharacterRect,
  type Point,
  type Rect
} from './interaction-geometry.ts';

export interface OverlayHit {
  inCameraGuide: boolean;
  inHeadGuide: boolean;
  inLeftPinchGuide: boolean;
  inRightPinchGuide: boolean;
}

/**
 * Temporary visual calibration aids for the hand interaction.
 * The guides are deliberately tied to #character's live screen rectangle,
 * so walking and reaction animations move the camera and head regions too.
 */
export class PettingOverlay {
  private readonly cameraGuide = this.makeGuide('camera-guide');
  private readonly headGuide = this.makeGuide('head-guide');
  private readonly leftPinchGuide = this.makeGuide('left-pinch-guide');
  private readonly rightPinchGuide = this.makeGuide('right-pinch-guide');
  private readonly handCursor = this.makeGuide('hand-cursor');

  constructor() {
    this.handCursor.textContent = '🖐️';
    this.handCursor.setAttribute('aria-label', '인식된 손 위치');
    this.handCursor.setAttribute('role', 'img');
    document.body.append(this.cameraGuide, this.headGuide, this.leftPinchGuide, this.rightPinchGuide, this.handCursor);
  }

  update(hand: Point | null, pinching = false, leftHand = false): OverlayHit {
    const character = document.querySelector<HTMLElement>('#character');
    if (!character) {
      this.hide();
      return { inCameraGuide: false, inHeadGuide: false, inLeftPinchGuide: false, inRightPinchGuide: false };
    }

    const characterRect = visibleCharacterRect(this.rect(character.getBoundingClientRect()));
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // The pink guide is a reduced monitor, not a preview cropped to each webcam's
    // native ratio. That keeps the calibration area consistent across cameras.
    const camera = cameraGuideRect(characterRect, viewport, viewport.width / viewport.height);
    const head = headGuideRect(camera);
    const leftPinch = cheekPinchGuideRect(camera, 'left');
    const rightPinch = cheekPinchGuideRect(camera, 'right');
    this.place(this.cameraGuide, camera);
    this.place(this.headGuide, head);
    this.place(this.leftPinchGuide, leftPinch);
    this.place(this.rightPinchGuide, rightPinch);
    this.cameraGuide.style.display = 'block';
    this.headGuide.style.display = 'block';
    this.leftPinchGuide.style.display = 'block';
    this.rightPinchGuide.style.display = 'block';

    if (!hand || !isNormalizedPointVisible(hand)) {
      this.handCursor.style.display = 'none';
      return { inCameraGuide: false, inHeadGuide: false, inLeftPinchGuide: false, inRightPinchGuide: false };
    }

    this.handCursor.textContent = pinching ? '🤌' : '🖐️';
    this.handCursor.style.transform = pinching
      ? `translate(-50%, -50%)${leftHand ? ' scaleX(-1)' : ''} rotate(-90deg)`
      : 'translate(-50%, -50%)';
    const screenPoint = mapHandToCameraGuide(hand, camera);
    const cursorPoint = keepPointInsideRect(screenPoint, camera, 28);
    this.handCursor.style.left = `${cursorPoint.x}px`;
    this.handCursor.style.top = `${cursorPoint.y}px`;
    this.handCursor.style.display = 'block';
    return {
      inCameraGuide: true,
      inHeadGuide: pointInRect(screenPoint, head),
      inLeftPinchGuide: pointInRect(screenPoint, leftPinch),
      inRightPinchGuide: pointInRect(screenPoint, rightPinch)
    };
  }

  hide(): void {
    this.cameraGuide.style.display = 'none';
    this.headGuide.style.display = 'none';
    this.leftPinchGuide.style.display = 'none';
    this.rightPinchGuide.style.display = 'none';
    this.handCursor.style.display = 'none';
  }

  destroy(): void {
    this.cameraGuide.remove();
    this.headGuide.remove();
    this.leftPinchGuide.remove();
    this.rightPinchGuide.remove();
    this.handCursor.remove();
  }

  private makeGuide(id: string): HTMLElement {
    const element = document.createElement('div');
    // The temporary-guide stylesheet intentionally uses ID selectors so these
    // overlays stay above the transparent desktop window. Assign the matching
    // IDs (rather than classes) or they fall back to the document's top left.
    element.id = id;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  private rect(rect: DOMRect): Rect {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  private place(element: HTMLElement, rect: Rect): void {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }
}
