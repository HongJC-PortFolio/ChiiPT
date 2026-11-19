import assert from 'node:assert/strict';
import test from 'node:test';

// 브라우저 없이 WalkFeature의 동작(위치 이동, 프레임 표시, 끄면 복귀)을 가짜 화면으로 점검한다.
class FakeElement {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  src = '';
  alt = '';
  draggable = false;
  getBoundingClientRect() { return { left: 660, bottom: 776, width: 120, height: 120 }; }
  remove(): void {}
}

let imageMode: 'ok' | 'fail' = 'ok';
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private url = '';
  get src(): string { return this.url; }
  set src(value: string) { this.url = value; queueMicrotask(() => (imageMode === 'ok' ? this.onload?.() : this.onerror?.())); }
}

async function setup(mode: 'ok' | 'fail') {
  imageMode = mode;
  const base = new FakeElement();
  const overlay = new FakeElement();
  const listeners: Record<string, (event: unknown) => void> = {};
  let command: ((value: unknown) => void) | undefined;
  let frameCallback: ((now: number) => void) | undefined;
  const g = globalThis as Record<string, unknown>;
  g.document = {
    baseURI: 'app://chiipt/index.html',
    querySelector: () => base,
    createElement: () => overlay,
    body: { append: () => {} }
  };
  g.window = {
    addEventListener: (type: string, fn: (event: unknown) => void) => { listeners[type] = fn; },
    removeEventListener: () => {},
    chiipt: { onCommand: (fn: (value: unknown) => void) => { command = fn; return () => {}; } }
  };
  g.Image = FakeImage;
  g.innerWidth = 1440;
  g.innerHeight = 800;
  g.requestAnimationFrame = (fn: (now: number) => void) => { frameCallback = fn; return 1; };
  g.cancelAnimationFrame = () => {};
  const { WalkFeature } = await import('../src/renderer/features/healing/walk/WalkFeature.ts');
  const feature = new WalkFeature();
  feature.attach();
  await new Promise(resolve => setTimeout(resolve, 5)); // 이미지 로드 완료 대기
  let now = 1000;
  const step = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / 60) { now += 1000 / 60; frameCallback?.(now); }
  };
  return { feature, base, overlay, step, move: (x: number, y: number) => listeners.pointermove?.({ clientX: x, clientY: y }), send: (value: unknown) => command?.(value) };
}

test('산책을 켜고 마우스를 움직이면 걷는 동안 걷기 프레임을 보여주고, 멈추면 원래 캐릭터가 돌아온다', async () => {
  const t = await setup('ok');
  t.send({ type: 'set-walk', on: true });
  t.move(1200, 300);
  t.step(0.5);
  assert.equal(t.base.dataset.walking, 'true');
  assert.equal(t.overlay.style.display, 'block');
  assert.equal(t.base.style.visibility, 'hidden');
  assert.match(t.overlay.src, /assets\/characters\/walk(-mirrored)?\/walk(-mirrored)?-frame-\d\d\.png$/);
  t.step(8);
  assert.equal(t.base.dataset.walking, 'false');
  assert.equal(t.overlay.style.display, 'none');
  assert.equal(t.base.style.visibility, '');
  assert.notEqual(t.base.style.translate, ''); // 걸어간 자리에 서 있다
});

test('산책을 끄면 원래 자리로 돌아가 이동량이 지워진다', async () => {
  const t = await setup('ok');
  t.send({ type: 'set-walk', on: true });
  t.move(1200, 300);
  t.step(6);
  t.send({ type: 'set-walk', on: false });
  t.step(10);
  assert.equal(t.base.style.translate, '');
  assert.equal(t.base.dataset.walking, 'false');
});

test('자는 중에는 산책을 쉰다', async () => {
  const t = await setup('ok');
  t.base.dataset.state = 'Sleep';
  t.send({ type: 'set-walk', on: true });
  t.move(1200, 300);
  t.step(2);
  assert.equal(t.base.dataset.walking, 'false');
  assert.equal(t.base.style.translate, '');
});

test('프레임을 불러오지 못하면 원래 캐릭터가 그대로 이동한다', async () => {
  const t = await setup('fail');
  t.send({ type: 'set-walk', on: true });
  t.move(1200, 300);
  t.step(0.5);
  assert.equal(t.base.dataset.walking, 'true');
  assert.equal(t.base.style.visibility, ''); // 숨기지 않는다
  assert.equal(t.overlay.style.display, 'none');
  assert.notEqual(t.base.style.translate, '');
});
