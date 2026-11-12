import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraManager } from '../src/renderer/shared/camera/CameraManager.ts';
import { AppRuntime } from '../src/renderer/shared/state/AppRuntime.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
import type { FeatureModule } from '../src/renderer/shared/types/index.ts';

function fakeStream() {
  const track = new EventTarget() as EventTarget & { stop(): void };
  let stops = 0;
  track.stop = () => { stops++; };
  return {
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
    track, stops: () => stops
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('concurrent callers share one request and one stream', async () => {
  const input = fakeStream();
  let requests = 0;
  const camera = new CameraManager({ getUserMedia: async () => { requests++; return input.stream; }, enumerateDevices: async () => [] });
  const [a, b] = await Promise.all([camera.start(), camera.start()]);
  assert.equal(requests, 1);
  assert.equal(a, b);
  assert.equal(a, input.stream);
  camera.stop();
  assert.equal(input.stops(), 1);
});

test('stop during permission request releases late stream without publishing it', async () => {
  const input = fakeStream();
  const request = deferred<MediaStream>();
  const camera = new CameraManager({ getUserMedia: () => request.promise, enumerateDevices: async () => [] });
  const pending = camera.start();
  await Promise.resolve();
  camera.stop();
  request.resolve(input.stream);
  assert.equal(await pending, null);
  assert.equal(input.stops(), 1);
  assert.equal(camera.getStream(), null);
  assert.equal(camera.state.status, 'stopped');
});

test('restart waits for a cancelled request and keeps only the new stream', async () => {
  const first = fakeStream();
  const second = fakeStream();
  const request = deferred<MediaStream>();
  let requests = 0;
  const camera = new CameraManager({ getUserMedia: () => ++requests === 1 ? request.promise : Promise.resolve(second.stream), enumerateDevices: async () => [] });
  const old = camera.start();
  await Promise.resolve();
  camera.stop();
  const fresh = camera.start();
  request.resolve(first.stream);
  assert.equal(await old, null);
  assert.equal(await fresh, second.stream);
  assert.equal(first.stops(), 1);
  camera.stop();
});

test('permission denial is reported and retry can succeed', async () => {
  const input = fakeStream();
  let requests = 0;
  const camera = new CameraManager({ getUserMedia: async () => {
    if (++requests === 1) throw new DOMException('denied', 'NotAllowedError');
    return input.stream;
  }, enumerateDevices: async () => [] });
  assert.equal(await camera.start(), null);
  assert.equal(camera.state.status, 'error');
  assert.match(camera.state.error!, /권한/);
  assert.equal(await camera.start(), input.stream);
  camera.stop();
});

test('device disconnection releases tracks and marks an error', async () => {
  const input = fakeStream();
  const camera = new CameraManager({ getUserMedia: async () => input.stream, enumerateDevices: async () => [] });
  await camera.start();
  input.track.dispatchEvent(new Event('ended'));
  assert.equal(camera.getStream(), null);
  assert.equal(camera.state.status, 'error');
  assert.equal(input.stops(), 1);
});

test('features receive the identical stream; sleep releases it and wake respects explicit stop', async () => {
  const streams = [fakeStream(), fakeStream()];
  let requests = 0;
  const camera = new CameraManager({ getUserMedia: async () => streams[requests++].stream, enumerateDevices: async () => [] });
  const received = new Map<string, MediaStream>();
  const feature = (id: FeatureModule['id']): FeatureModule => ({ id,
    start: stream => { received.set(id, stream); }, stop: () => { received.delete(id); }
  });
  const character = new CharacterController();
  const runtime = new AppRuntime(camera, character, [feature('posture'), feature('healing')]);
  await runtime.startCamera();
  assert.equal(received.get('posture'), received.get('healing'));
  assert.equal(received.get('posture'), streams[0].stream);
  runtime.sleep();
  assert.equal(character.state, 'Sleep');
  assert.equal(received.size, 0);
  assert.equal(streams[0].stops(), 1);
  await runtime.wake();
  assert.equal(requests, 2);
  runtime.stopCamera();
  runtime.sleep();
  await runtime.wake();
  assert.equal(requests, 2);
  runtime.dispose();
});

test('camera selection requests exact device without requesting audio', async () => {
  const input = fakeStream();
  let constraints: MediaStreamConstraints | undefined;
  const camera = new CameraManager({ getUserMedia: async value => { constraints = value; return input.stream; }, enumerateDevices: async () => [] });
  await camera.start('external-webcam');
  assert.deepEqual(constraints, { video: { deviceId: { exact: 'external-webcam' } }, audio: false });
  camera.stop();
});
