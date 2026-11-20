import assert from 'node:assert/strict';
import test from 'node:test';
import { recognizeSidewaysPinch } from '../src/renderer/features/healing/pinch-recognition.ts';
import type { HandLandmark } from '../src/renderer/features/healing/hand-landmarker.ts';

function hand(overrides: Record<number, Partial<HandLandmark>>): HandLandmark[] {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [index, point] of Object.entries(overrides)) Object.assign(landmarks[Number(index)]!, point);
  return landmarks;
}

test('회전 방향과 관계없이 붙은 엄지·검지를 볼 꼬집기로 인식한다', () => {
  const pinch = recognizeSidewaysPinch(hand({
    0: { x: 0.3, y: 0.5 }, 4: { x: 0.68, y: 0.51 }, 8: { x: 0.7, y: 0.49 },
    5: { x: 0.45, y: 0.4 }, 17: { x: 0.45, y: 0.6 }
  }));
  assert.deepEqual(pinch?.point, { x: 0.69, y: 0.5 });
});

test('엄지와 검지가 벌어지면 쓰다듬기와 구분해 꼬집기로 인식하지 않는다', () => {
  const open = hand({
    0: { x: 0.3, y: 0.5 }, 4: { x: 0.56, y: 0.5 }, 8: { x: 0.85, y: 0.5 },
    5: { x: 0.45, y: 0.4 }, 17: { x: 0.45, y: 0.6 }
  });
  assert.equal(recognizeSidewaysPinch(open), null);
});
