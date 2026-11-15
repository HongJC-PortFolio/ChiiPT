import test from 'node:test';
import assert from 'node:assert/strict';
import { LeftFallSequence, leftFallFrames } from '../src/renderer/character/animation/LeftFallSequence.ts';

test('all eight source frames play in order and the final pose holds', () => {
  const sequence = new LeftFallSequence();
  const visited = new Set<number>();
  for (let i = 0; i < 300; i++) visited.add(sequence.update((1 / 120) * 8, true).index);
  assert.deepEqual([...visited], [0,1,2,3,4,5,6,7]);
  const held = sequence.update((10) * 8, true);
  assert.equal(held.index, 7); assert.equal(held.opacity, 1);
  assert.equal(leftFallFrames.length, 8);
});
test('release fades to neutral without reversing dust; rapid repress resumes current frame', () => {
  const sequence = new LeftFallSequence();
  sequence.update((3) * 8, true);
  const fading = sequence.update((.2) * 8, false);
  assert.equal(fading.index, 7); assert.ok(fading.opacity > 0 && fading.opacity < 1);
  const resumed = sequence.update((0) * 8, true);
  assert.equal(resumed.index, 7); assert.equal(resumed.opacity, fading.opacity);
  sequence.update((1.2) * 8, false); assert.equal(sequence.opacity, 0);
  assert.equal(sequence.update((.01) * 8, true).index, 0);
});
test('layout uses one scale so flattened poses are not stretched upright', () => {
  const scale = 150 / leftFallFrames[0].h;
  assert.equal(leftFallFrames[0].h * scale, 150);
  assert.ok(leftFallFrames[7].h * scale < 120);
  assert.ok(leftFallFrames.every(f => f.w * scale < 185));
});

test('viewport travel decelerates, stays grounded after impact, and returns continuously', () => {
  for (const width of [600, 900, 1600]) {
    const seq = new LeftFallSequence();
    const distance = width * .6;
    let previous = 0;
    for (let i = 0; i < 260; i++) {
      const pose = seq.update((.01) * 8, true, distance);
      assert.ok(pose.x <= previous + 1e-8);
      if (pose.index >= 3) assert.equal(pose.lift, 0);
      previous = pose.x;
    }
    assert.equal(previous, -distance);
    assert.equal(seq.update((0) * 8, false, distance).x, previous);
    const halfway = seq.update((.5625) * 8, false, distance);
    assert.ok(Math.abs(halfway.x + distance / 2) < 1e-6);
    assert.equal(seq.update((.5625) * 8, false, distance).x, 0);
    assert.equal(seq.update((3) * 8, true, width * .3).x, -width * .3);
  }
});

test('in-between transforms vary within a frame and settle without residual deformation', () => {
  const sequence = new LeftFallSequence();
  const a = sequence.update(.5, true);
  const b = sequence.update(.5, true);
  assert.equal(a.index, b.index);
  assert.notEqual(a.rotation, b.rotation);
  const impact = sequence.update(6, true);
  assert.equal(impact.index, 3);
  assert.ok(impact.squash > 0);
  const held = sequence.update(30, true);
  assert.equal(held.rotation, 0); assert.equal(held.squash, 0);
  const recovered = sequence.update(10, false);
  assert.equal(recovered.opacity, 0); assert.equal(recovered.rotation, 0);
});
