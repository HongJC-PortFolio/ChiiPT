import test from 'node:test';
import assert from 'node:assert/strict';
import { ShoulderPosture, shoulderSettings } from '../src/renderer/features/posture/ShoulderPosture.ts';

function frame(degrees: number, timestampMs: number, width = 640, height = 480) {
  const landmarks = Array.from({ length: 13 }, () => ({ x: .5, y: .5, visibility: 1 }));
  landmarks[11] = { x: .7, y: .5 + Math.tan(degrees * Math.PI / 180) * .4 * width / height, visibility: 1 };
  landmarks[12] = { x: .3, y: .5, visibility: 1 };
  return { landmarks, imageWidth: width, imageHeight: height, timestampMs };
}

test('shoulders alone drive both directions and intensity independent of aspect ratio', () => {
  for (const [width, height] of [[640, 480], [1280, 720]]) {
    for (const angle of [-25, -15, -6, 6, 15, 25]) {
      const detector = new ShoulderPosture();
      detector.update(frame(angle, 0, width, height));
      const result = detector.update(frame(angle, 250, width, height));
      assert.equal(result.state, angle < 0 ? 'right' : 'left');
      assert.ok(Math.abs(result.intensity - Math.min(1, (Math.abs(angle) - shoulderSettings.enterDegrees) / (shoulderSettings.maximumDegrees - shoulderSettings.enterDegrees))) < .00001);
    }
  }
});

test('brief spikes do not trigger movement; stable neutral permits return', () => {
  const detector = new ShoulderPosture();
  assert.equal(detector.update(frame(20, 0)).state, 'neutral');
  assert.equal(detector.update(frame(20, 100)).state, 'neutral');
  assert.equal(detector.update(frame(20, 250)).state, 'left');
  for (let t = 350; t <= 1500; t += 50) detector.update(frame(0, t));
  assert.equal(detector.update(frame(0, 1550)).state, 'neutral');
});

test('hidden or missing shoulders are unavailable, not neutral', () => {
  const detector = new ShoulderPosture();
  const input = frame(15, 0);
  input.landmarks[11]!.visibility = .1;
  assert.equal(detector.update(input).state, 'unavailable');
  input.landmarks.length = 0;
  assert.equal(detector.update(input).state, 'unavailable');
});


test('left shoulder lower Y means right travel even when image X is mirrored', () => {
  for (const mirrored of [false, true]) {
    const detector = new ShoulderPosture();
    const input = frame(-15, 0);
    if (mirrored) for (const point of input.landmarks) point.x = 1 - point.x;
    detector.update(input);
    input.timestampMs = 250;
    assert.equal(detector.update(input).state, 'right');
  }
});
