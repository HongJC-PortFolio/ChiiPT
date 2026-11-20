/** Geometry shared by the temporary interaction guides and hit testing. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const GUIDE_MARGIN = 16;
const HEAD = { width: 0.5, height: 0.45 };
// 오른쪽 볼과 바로 옆 여백만 포함하는 임시 꼬집기 영역.
const PINCH_GUIDE = { sideByHeight: 0.56, leftByWidth: 0.52, topByHeight: 0.14 };
// idle-open-frame-01.png is a 256 × 240 canvas. These are the measured bounds
// of its non-transparent character pixels, not the transparent PNG padding.
const IDLE_ART = { left: 62 / 256, top: 78 / 240, width: 131 / 256, height: 150 / 240 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

/** The visible character art within its transparent 256 × 240 PNG canvas. */
export function visibleCharacterRect(canvas: Rect): Rect {
  return {
    left: canvas.left + canvas.width * IDLE_ART.left,
    top: canvas.top + canvas.height * IDLE_ART.top,
    width: canvas.width * IDLE_ART.width,
    height: canvas.height * IDLE_ART.height
  };
}

/**
 * Makes the pink guide a reduced version of the monitor aspect ratio.
 * Its height matches the visible character pixels, so transparent PNG padding
 * cannot make the guide look much larger than the character.
 */
export function cameraGuideRect(character: Rect, viewport: Viewport, aspectRatio: number): Rect {
  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const marginX = Math.min(GUIDE_MARGIN, viewport.width / 2);
  const marginY = Math.min(GUIDE_MARGIN, viewport.height / 2);
  const usableWidth = Math.max(1, viewport.width - marginX * 2);
  const usableHeight = Math.max(1, viewport.height - marginY * 2);
  const maximumHeight = Math.max(1, Math.min(usableHeight, usableWidth / aspect));
  const height = Math.min(character.height, maximumHeight);
  const width = height * aspect;
  const left = clamp(
    character.left + character.width / 2 - width / 2,
    marginX,
    Math.max(marginX, viewport.width - marginX - width)
  );
  const top = clamp(
    character.top + character.height - height,
    marginY,
    Math.max(marginY, viewport.height - marginY - height)
  );
  return { left, top, width, height };
}

/** Blue head-only interaction area, centered at the top of the pink guide. */
export function headGuideRect(camera: Rect): Rect {
  const width = camera.width * HEAD.width;
  const height = camera.height * HEAD.height;
  return {
    left: camera.left + (camera.width - width) / 2,
    top: camera.top,
    width,
    height
  };
}

/** Green square used only for the cheek-pinch interaction. */
export function cheekPinchGuideRect(camera: Rect, placement: 'left' | 'right'): Rect {
  const length = Math.min(camera.height * PINCH_GUIDE.sideByHeight, camera.width * 0.44);
  return {
    left: placement === 'left'
      ? camera.left + camera.width * (1 - PINCH_GUIDE.leftByWidth) - length
      : camera.left + camera.width * PINCH_GUIDE.leftByWidth,
    top: camera.top + camera.height * PINCH_GUIDE.topByHeight,
    width: length,
    height: length
  };
}

export function isNormalizedPointVisible(point: Point): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/** Camera previews are mirrored to give the user a natural mirror interaction. */
export function mapHandToCameraGuide(point: Point, camera: Rect): Point {
  return {
    x: camera.left + (1 - point.x) * camera.width,
    y: camera.top + point.y * camera.height
  };
}

/** Keeps the full hand emoji inside the guide instead of only keeping its center inside. */
export function keepPointInsideRect(point: Point, rect: Rect, inset: number): Point {
  const safeInset = Math.min(Math.max(0, inset), rect.width / 2, rect.height / 2);
  return {
    x: clamp(point.x, rect.left + safeInset, rect.left + rect.width - safeInset),
    y: clamp(point.y, rect.top + safeInset, rect.top + rect.height - safeInset)
  };
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.left && point.x <= rect.left + rect.width
    && point.y >= rect.top && point.y <= rect.top + rect.height;
}
