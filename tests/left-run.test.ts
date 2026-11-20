import test from 'node:test';
import assert from 'node:assert/strict';
import { LeftRunSequence, leftRunSettings } from '../src/renderer/character/animation/LeftRunSequence.ts';

function advance(s: LeftRunSequence, seconds: number, state: 'left'|'right'|'neutral'|'unavailable', distance = 600, intensity = .1) {
  let result = s.update(0, state, intensity, distance);
  const count = Math.round(seconds * 100);
  for (let i=0;i<count;i++) result = s.update(seconds/count, state, intensity, distance);
  return result;
}
test('time tiers smooth to 12/20/30 FPS and 3/8/15 degrees independently of intensity', () => {
  for (const intensity of [0, 1]) {
    const s = new LeftRunSequence();
    for (const [seconds, fps, angle] of [[leftRunSettings.mediumAfterSeconds - 1,12,3],[leftRunSettings.strongAfterSeconds - leftRunSettings.mediumAfterSeconds,20,8],[5,30,15]]) {
      const r = advance(s,seconds!,'left',600,intensity);
      assert.ok(Math.abs(r.fps-fps!) < .001);
      assert.ok(Math.abs(r.rotation*180/Math.PI-angle!) < .001);
      assert.equal(r.velocity,-20);
    }
  }
});
test('both directions take 30 seconds at different widths; feet keep looping at edge', () => {
  for (const distance of [200,600,1000]) for (const state of ['left','right'] as const) {
    const s = new LeftRunSequence(), sign = state === 'left' ? -1 : 1;
    assert.ok(Math.abs(advance(s,15,state,distance).x-sign*distance/2)<1e-7);
    assert.ok(Math.abs(advance(s,15,state,distance).x-sign*distance)<1e-7);
    const frames = new Set<number>();
    for(let i=0;i<100;i++) frames.add(s.update(.01,state,1,distance).index);
    assert.equal(frames.size,leftRunSettings.frameCount); assert.equal(s.x,sign*distance);
    assert.equal(s.update(0,state,1,distance/2).x,sign*distance/2);
  }
});
test('direction changes reset time; neutral return keeps fixed speed and can be interrupted', () => {
  const s = new LeftRunSequence(); advance(s,12,'left');
  const changed = s.update(.01,'right',1,600);
  assert.equal(changed.heldSeconds,.01); assert.equal(changed.tier,0);
  const before = s.x, returning = s.update(.1,'neutral',1,600);
  assert.equal(returning.x-before,15); assert.equal(returning.fps,14);
  assert.equal(returning.heldSeconds,0);
  const resumed = s.update(.1,'left',1,600);
  assert.equal(resumed.x,returning.x-2);
  advance(s,10,'neutral'); assert.equal(s.x,0); assert.equal(s.opacity,0);
});
test('short loss freezes pose and time; long loss returns home and resets timer', () => {
  const s = new LeftRunSequence(); const before = advance(s,7,'right');
  const paused = s.update(.4,'unavailable',0,600);
  for(const key of ['x','index','rotation','fps','opacity','heldSeconds'] as const) assert.equal(paused[key],before[key]);
  assert.equal(s.update(.1,'right',0,600).heldSeconds,before.heldSeconds+.1);
  s.update(.5,'unavailable',0,600);
  const returned = s.update(.6,'unavailable',0,600);
  assert.equal(returned.state,'neutral'); assert.equal(returned.heldSeconds,0);
  assert.ok(returned.x<paused.x); assert.equal(returned.fps,14);
});
test('real dt gives consistent position and hold time across frame rates', () => {
  for(const hz of [30,60,120]) {
    const s = new LeftRunSequence(); let r=s.update(0,'right',0,600);
    for(let i=0;i<hz*12;i++) r=s.update(1/hz,'right',0,600);
    assert.ok(Math.abs(r.x-240)<1e-7); assert.ok(Math.abs(r.heldSeconds-12)<1e-7);
    assert.equal(r.tier,12 < leftRunSettings.mediumAfterSeconds ? 0 : 12 < leftRunSettings.strongAfterSeconds ? 1 : 2);
  }
});

test('each time tier plays all 14 PNG frames in order in both directions', () => {
  for (const state of ['left', 'right'] as const) {
    for (const elapsed of [1, 12, 22]) {
      const s = new LeftRunSequence();
      advance(s, elapsed, state);
      let previous = s.update(0, state, 0, 600).index;
      const seen = new Set([previous]);
      for (let i = 0; i < 120; i++) {
        const current = s.update(1 / 60, state, 0, 600).index;
        assert.ok(current === previous || current === (previous + 1) % leftRunSettings.frameCount);
        seen.add(current);
        previous = current;
      }
      assert.equal(seen.size, leftRunSettings.frameCount);
    }
  }
});