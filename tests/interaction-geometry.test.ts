import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cameraGuideRect,
  cheekPinchGuideRect,
  headGuideRect,
  isNormalizedPointVisible,
  keepPointInsideRect,
  mapHandToCameraGuide,
  pointInRect,
  visibleCharacterRect
} from '../src/renderer/features/healing/interaction-geometry.ts';

test('카메라 가이드는 투명 여백을 빼고 캐릭터를 높이까지 꽉 채운다', () => {
  const art = visibleCharacterRect({ left: 832, top: 816, width: 256, height: 240 });
  const camera = cameraGuideRect(art, { width: 1920, height: 1080 }, 16 / 9);
  assert.ok(Math.abs(camera.width / camera.height - 16 / 9) < 1e-12);
  assert.equal(camera.height, 150);
  assert.equal(camera.left + camera.width / 2, art.left + art.width / 2);
  assert.equal(camera.top, 894);
  assert.equal(camera.top + camera.height, 1044);
});

test('화면 가장자리의 캐릭터도 카메라 가이드가 화면 밖으로 나가지 않는다', () => {
  const camera = cameraGuideRect(visibleCharacterRect({ left: -40, top: -30, width: 256, height: 240 }), { width: 700, height: 500 }, 16 / 9);
  assert.ok(camera.left >= 16);
  assert.ok(camera.top >= 16);
  assert.ok(camera.left + camera.width <= 684);
  assert.ok(camera.top + camera.height <= 484);
});

test('손 좌표는 분홍 박스 안에 유지되고 중앙 상단 파란 박스에서만 적중한다', () => {
  const character = visibleCharacterRect({ left: 400, top: 600, width: 256, height: 240 });
  const camera = cameraGuideRect(character, { width: 1440, height: 900 }, 16 / 9);
  const head = headGuideRect(camera);
  const sourcePoint = { x: 0.5, y: (head.top + head.height / 2 - camera.top) / camera.height };
  const screenPoint = mapHandToCameraGuide(sourcePoint, camera);
  assert.equal(screenPoint.x, camera.left + camera.width / 2);
  assert.ok(pointInRect(screenPoint, head));
  assert.equal(head.top, camera.top);
  assert.equal(head.left + head.width / 2, camera.left + camera.width / 2);
  assert.equal(head.height, camera.height * 0.45);
  assert.deepEqual(keepPointInsideRect({ x: camera.left - 10, y: camera.top + camera.height + 10 }, camera, 28), {
    x: camera.left + 28, y: camera.top + camera.height - 28
  });
  assert.equal(isNormalizedPointVisible(sourcePoint), true);
  assert.equal(isNormalizedPointVisible({ x: 1.01, y: 0.5 }), false);
});

test('꼬집기 영역은 오른쪽 볼과 오른쪽 여백을 포함하는 정사각형이다', () => {
  const camera = { left: 28, top: 24, width: 253, height: 148 };
  const left = cheekPinchGuideRect(camera, 'left');
  const right = cheekPinchGuideRect(camera, 'right');
  assert.equal(left.width, left.height);
  assert.deepEqual(left, { ...right, left: camera.left * 2 + camera.width - right.left - right.width });
  assert.ok(right.left > camera.left + camera.width / 2);
  assert.ok(right.left + right.width < camera.left + camera.width);
  assert.ok(right.top > camera.top);
  assert.ok(right.top + right.height < camera.top + camera.height);
});
