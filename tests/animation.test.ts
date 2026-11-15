import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseAnimation } from '../src/renderer/character/animation/PoseAnimation.ts';

test('base rotates before pose blending; both sides return to neutral', () => {
  for (const direction of [-1, 1] as const) {
    const a = new PoseAnimation(); a.setDirection(direction);
    const early = a.update(0.2); assert.ok(early.angle * direction > 0); assert.equal(early.weights[0], 1);
    const fallen = a.update(2); assert.equal(fallen.weights[direction < 0 ? 1 : 2], 1);
    a.setDirection(0); assert.equal(a.update(0).angle, fallen.angle);
    const idle = a.update(2); assert.equal(idle.x, 0); assert.equal(idle.angle, 0); assert.deepEqual(idle.weights, [1, 0, 0]);
  }
});
test('mid-motion reversal preserves position and normalized blends', () => {
  const a = new PoseAnimation(); a.setDirection(-1); a.update(0.7); const before = a.value;
  a.setDirection(1); a.update(0); assert.equal(a.value, before);
  for (let i = 0; i < 180; i++) { const p = a.update(1 / 60); assert.ok(Math.abs(p.weights.reduce((x, y) => x + y, 0) - 1) < 1e-9); }
  assert.equal(a.value, 1);
});
