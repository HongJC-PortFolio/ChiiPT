import {
  cameraGuideRect,
  cheekPinchGuideRect,
  headGuideRect,
  isNormalizedPointVisible,
  keepPointInsideRect,
  mapHandToCameraGuide,
  pointInRect,
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
  private readonly handCursor = this.makeGuide('hand-cursor');
  private readonly pettingImage = document.createElement('img');
  private readonly pinchIcon = document.createElement('img');
  private readonly leftPinchUrl = new URL('/assets/characters/왼쪽볼당기기.png', window.location.href).href;
  private readonly rightPinchUrl = new URL('/assets/characters/오른쪽볼당기기.png', window.location.href).href;

  constructor() {
    this.pettingImage.src = new URL('/assets/characters/쓰담쓰담용.png', window.location.href).href;
    this.pettingImage.alt = '';
    this.pettingImage.draggable = false;
    this.pinchIcon.src = this.rightPinchUrl;
    this.pinchIcon.alt = '';
    this.pinchIcon.draggable = false;
    this.pinchIcon.hidden = true;
    this.handCursor.append(this.pettingImage, this.pinchIcon);
    this.handCursor.setAttribute('aria-label', '인식된 손 위치');
    this.handCursor.setAttribute('role', 'img');
    document.body.append(this.cameraGuide, this.headGuide, this.handCursor);
  }

  update(hand: Point | null, pinching = false, leftHand = false): OverlayHit {
    const characterRect = renderedCharacterRect();
    if (!characterRect) {
      this.hide();
      return { inCameraGuide: false, inHeadGuide: false, inLeftPinchGuide: false, inRightPinchGuide: false };
    }

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // The pink guide is a reduced monitor, not a preview cropped to each webcam's
    // native ratio. That keeps the calibration area consistent across cameras.
    const camera = cameraGuideRect(characterRect, viewport, viewport.width / viewport.height);
    const head = headGuideRect({ ...characterRect, left: characterRect.left - characterRect.width / 2, width: characterRect.width * 2 });
    this.place(this.cameraGuide, camera);
    this.place(this.headGuide, head);
    this.cameraGuide.style.display = 'block';
    this.headGuide.style.display = 'block';

    if (!hand || !isNormalizedPointVisible(hand)) {
      this.handCursor.style.display = 'none';
      return { inCameraGuide: false, inHeadGuide: false, inLeftPinchGuide: false, inRightPinchGuide: false };
    }

    this.pettingImage.hidden = pinching;
    this.pinchIcon.hidden = !pinching;
    const pinchUrl = leftHand ? this.leftPinchUrl : this.rightPinchUrl;
    if (pinching && this.pinchIcon.src !== pinchUrl) this.pinchIcon.src = pinchUrl;
    // The supplied left/right PNGs already have their intended orientation.
    this.handCursor.style.transform = 'translate(-50%, -50%)';
    const screenPoint = mapHandToCameraGuide(hand, camera);
    const cursorPoint = keepPointInsideRect(screenPoint, camera, 28);
    this.handCursor.style.left = `${cursorPoint.x}px`;
    this.handCursor.style.top = `${cursorPoint.y}px`;
    this.handCursor.style.display = 'block';
    return { inCameraGuide: true, inHeadGuide: pointInRect(screenPoint, head),
      inLeftPinchGuide: pointInRect(screenPoint, cheekPinchGuideRect(camera, 'left')),
      inRightPinchGuide: pointInRect(screenPoint, cheekPinchGuideRect(camera, 'right')) };
  }

  hide(): void {
    this.cameraGuide.style.display = 'none';
    this.headGuide.style.display = 'none';
    this.handCursor.style.display = 'none';
  }

  destroy(): void {
    this.cameraGuide.remove();
    this.headGuide.remove();
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

  private place(element: HTMLElement, rect: Rect): void {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }
}

/** Actual painted pixels in CSS screen coordinates, including reaction transforms. */
export function renderedCharacterRect(): Rect | null {
  const host = document.querySelector<HTMLElement>('#character');
  const canvas = host?.querySelector('canvas');
  if (!host || !canvas || host.dataset.mode !== 'healing' || host.dataset.state !== 'Awake'
      || canvas.dataset.atHome !== 'true' || canvas.dataset.walking === 'true'
      || canvas.dataset.stretchPhase || canvas.dataset.wakeFrame) return null;
  const values = canvas.dataset.artBounds?.split(',').map(Number);
  if (!values || values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [left, top, width, height] = values as [number, number, number, number];
  const style = getComputedStyle(canvas);
  const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
  const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
  const hostRect = host.getBoundingClientRect();
  const baseX = canvas.style.position === 'fixed' ? parseFloat(canvas.style.left) || 0 : hostRect.left;
  const baseY = canvas.style.position === 'fixed' ? parseFloat(canvas.style.top) || 0 : hostRect.top;
  const points = [[left,top],[left+width,top],[left,top+height],[left+width,top+height]].map(([x,y]) => {
    const p = matrix.transformPoint({ x: x! - ox!, y: y! - oy! });
    return { x: baseX + ox! + p.x, y: baseY + oy! + p.y };
  });
  const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) };
}
