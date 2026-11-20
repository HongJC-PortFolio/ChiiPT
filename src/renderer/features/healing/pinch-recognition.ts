import type { HandLandmark } from './hand-landmarker.ts';

export interface PinchGesture {
  /** The point between the thumb and index finger that touches the cheek. */
  point: { x: number; y: number };
}

const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const PINKY_MCP = 17;

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Recognizes a thumb-and-index pinch. The fingertips touching is the defining
 * signal; rotation is deliberately not used as a gate because a mirrored
 * camera and left/right hands invert that direction. Distances are scaled by
 * palm width, so it works at different distances from the camera.
 */
export function recognizeSidewaysPinch(landmarks: HandLandmark[]): PinchGesture | null {
  const thumbTip = landmarks[THUMB_TIP];
  const indexMcp = landmarks[INDEX_MCP];
  const indexTip = landmarks[INDEX_TIP];
  const pinkyMcp = landmarks[PINKY_MCP];
  if (!thumbTip || !indexMcp || !indexTip || !pinkyMcp) return null;

  if (![thumbTip,indexMcp,indexTip,pinkyMcp].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) return null;
  const palmWidth = distance(indexMcp, pinkyMcp);
  if (palmWidth < 0.001) return null;

  const point = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
  // This threshold leaves room for MediaPipe's fingertip jitter while still
  // requiring the two fingertip landmarks to be visibly together.
  const fingertipsClosed = distance(thumbTip, indexTip) <= palmWidth * 0.55;

  return fingertipsClosed ? { point } : null;
}
