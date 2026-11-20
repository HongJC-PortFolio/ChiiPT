import assert from 'node:assert/strict';
import test from 'node:test';
import { WalkController, walkSettings } from '../src/renderer/features/healing/walk/WalkController.ts';

const bounds = { w: 1440, h: 800 };

function run(controller: WalkController, seconds: number): { transitions: number } {
  let transitions = 0;
  let previous = controller.moving;
  for (let t = 0; t < seconds; t += 1 / 60) {
    controller.update(1 / 60, bounds);
    if (controller.moving !== previous) { transitions++; previous = controller.moving; }
  }
  return { transitions };
}

function makeController(): WalkController {
  const controller = new WalkController();
  controller.home = { x: 720, y: 776 };
  controller.x = controller.home.x;
  controller.y = controller.home.y;
  return controller;
}

test('산책이 켜져 있으면 커서 쪽으로 걸어가 멈춤 거리에서 선다', () => {
  const c = makeController();
  c.enabled = true;
  c.target = { x: 1300, y: 300 };
  run(c, 10);
  const distance = Math.hypot(c.x - 1300, c.y - 300);
  assert.ok(distance <= walkSettings.stopDistance + 2, `거리 ${distance}`);
  assert.equal(c.moving, false);
});

test('멈춰 있는 동안에는 걷기와 멈춤이 계속 바뀌지 않는다 (떨림 없음)', () => {
  const c = makeController();
  c.enabled = true;
  c.target = { x: 1000, y: 400 };
  run(c, 8);
  assert.equal(run(c, 3).transitions, 0);
});

test('걷는 방향에 따라 좌/우를 정한다', () => {
  const left = makeController();
  left.enabled = true;
  left.target = { x: 100, y: 700 };
  run(left, 2);
  assert.equal(left.facing, 'left');

  const right = makeController();
  right.enabled = true;
  right.target = { x: 1300, y: 700 };
  run(right, 2);
  assert.equal(right.facing, 'right');
});

test('산책을 끄면 원래 자리(home)로 걸어서 돌아온다', () => {
  const c = makeController();
  c.enabled = true;
  c.target = { x: 1300, y: 300 };
  run(c, 6);
  c.enabled = false;
  run(c, 8);
  assert.ok(Math.hypot(c.x - c.home.x, c.y - c.home.y) < 5);
  assert.equal(c.moving, false);
});

test('갈 수 없는 곳에 커서가 있어도 화면 밖으로 나가지 않고 제자리에서 허우적대지 않는다', () => {
  const c = makeController();
  c.enabled = true;
  c.target = { x: 700, y: 3 }; // 화면 맨 위
  run(c, 8);
  assert.ok(c.y >= walkSettings.headroom, `y ${c.y}`);
  assert.equal(c.moving, false);
  c.target = { x: 5000, y: 400 }; // 화면 밖 오른쪽
  run(c, 8);
  assert.ok(c.x <= bounds.w - walkSettings.margin + 1, `x ${c.x}`);
  assert.equal(c.moving, false);
});

test('커서 정보가 없으면 가만히 있는다', () => {
  const c = makeController();
  c.enabled = true;
  c.target = null;
  run(c, 2);
  assert.equal(c.moving, false);
  assert.equal(c.x, c.home.x);
});
