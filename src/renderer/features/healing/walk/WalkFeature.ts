import { WalkController } from './WalkController.ts';

/**
 * 산책: 마우스를 따라 캐릭터가 화면 어디든 걸어 다닌다. (힐링 파트)
 *
 * 다른 파트의 코드(캐릭터 렌더러, index.ts)는 건드리지 않는다. 화면에 이미 있는 #character 요소를
 * 읽기 전용으로 찾아서, CSS `translate` 속성(= transform과 따로 합쳐지는 속성)으로 위치만 옮긴다.
 * 그래서 쓰다듬기 연출(PetReactions)이 transform으로 움직여도 서로 충돌하지 않는다.
 *
 * 걷는 동안에는 걷기 프레임(PNG)을 보여주는 이미지를 따로 얹고, 원래 캐릭터는 잠깐 숨긴다.
 * 프레임을 못 불러오면(앱이 이미지를 아직 못 읽는 상태 등) 원래 캐릭터가 그대로 미끄러져 다닌다.
 *
 * 켜고 끄기: 우클릭 메뉴의 '산책' → { type: 'set-walk', on } 명령. 끄면 원래 자리(home)로 걸어서 돌아온다.
 */

/** 걷기 프레임 원본이 향하는 쪽. 왼쪽으로 걸을 때 반대로 보이면 'right'로 바꾼다. */
const WALK_FRAMES_FACE: 'left' | 'right' = 'left';
const FRAME_COUNT = 14;
const FPS = 16;
/** 프레임 PNG 규격: 캔버스 크기, 그리고 발바닥 중앙의 높이(위에서 feet px). */
const CANVAS = { w: 256, h: 240, feet: 228 };

type Dir = 'walk' | 'walk-mirrored';
const frameUrl = (dir: Dir, index: number): string =>
  new URL(`assets/characters/${dir}/${dir}-frame-${String(index + 1).padStart(2, '0')}.png`, document.baseURI).href;

export class WalkFeature {
  readonly controller = new WalkController();
  private enabled = false;
  private base: HTMLElement | null = null;
  private overlay: HTMLImageElement | null = null;
  private frames: Record<Dir, HTMLImageElement[]> = { walk: [], 'walk-mirrored': [] };
  private loaded = 0;
  private failed = false;
  private frame = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private unsubscribe: (() => void) | null = null;

  private onPointerMove = (event: PointerEvent): void => {
    this.controller.target = { x: event.clientX, y: event.clientY };
  };
  private onResize = (): void => this.measureHome();

  /** 화면이 준비된 뒤 한 번 호출. 이미 켜져 있으면 아무것도 하지 않는다. */
  attach(): void {
    if (this.raf) return;
    this.base = document.querySelector<HTMLElement>('#character');
    if (!this.base) return;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('resize', this.onResize);
    this.unsubscribe = window.chiipt?.onCommand(command => {
      if (command.type === 'set-walk') this.setEnabled(command.on);
    }) ?? null;
    this.preload();
    this.measureHome();
    this.controller.x = this.controller.home.x;
    this.controller.y = this.controller.home.y;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('resize', this.onResize);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.overlay?.remove();
    this.overlay = null;
    this.restoreBase();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** 걷기 프레임을 미리 불러 둔다. 하나라도 실패하면 이미지 없이(원래 캐릭터가 미끄러지는 방식으로) 동작한다. */
  private preload(): void {
    for (const dir of ['walk', 'walk-mirrored'] as const) {
      this.frames[dir] = Array.from({ length: FRAME_COUNT }, (_, i) => {
        const image = new Image();
        image.onload = () => { this.loaded++; };
        image.onerror = () => { this.failed = true; };
        image.src = frameUrl(dir, i);
        return image;
      });
    }
  }

  private get framesReady(): boolean {
    return !this.failed && this.loaded >= FRAME_COUNT * 2;
  }

  /** 원래 자리(home) = 이동량이 0일 때 #character 의 발바닥 중앙. */
  private measureHome(): void {
    if (!this.base) return;
    const previous = this.base.style.translate;
    this.base.style.translate = '';
    const rect = this.base.getBoundingClientRect();
    this.base.style.translate = previous;
    this.controller.home = { x: rect.left + rect.width / 2, y: rect.bottom };
  }

  private ensureOverlay(): HTMLImageElement {
    if (this.overlay) return this.overlay;
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    Object.assign(image.style, {
      position: 'fixed', left: '0', top: '0', width: `${CANVAS.w}px`, height: `${CANVAS.h}px`,
      pointerEvents: 'none', display: 'none'
    });
    document.body.append(image);
    this.overlay = image;
    return image;
  }

  private restoreBase(): void {
    if (!this.base) return;
    this.base.style.translate = '';
    this.base.style.visibility = '';
    delete this.base.dataset.walking;
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const base = this.base;
    if (!base) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    // 자는 중에는 산책을 쉰다 (켜 둔 상태는 유지되고, 깨면 다시 따라다닌다)
    const awake = base.dataset.state === undefined || base.dataset.state === 'Awake';
    const c = this.controller;
    c.enabled = this.enabled && awake;
    c.update(dt, { w: innerWidth, h: innerHeight });

    const dx = c.x - c.home.x, dy = c.y - c.home.y;
    const atHome = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;
    base.style.translate = atHome ? '' : `${dx}px ${dy}px`;
    base.dataset.walking = c.moving ? 'true' : 'false';

    const showFrames = c.moving && this.framesReady;
    base.style.visibility = showFrames ? 'hidden' : '';
    const overlay = this.ensureOverlay();
    overlay.style.display = showFrames ? 'block' : 'none';
    if (!showFrames) return;

    // 걷는 방향에 맞는 프레임을 정해진 속도로 재생
    this.acc += dt;
    while (this.acc >= 1 / FPS) { this.acc -= 1 / FPS; this.frame = (this.frame + 1) % FRAME_COUNT; }
    const dir: Dir = c.facing === WALK_FRAMES_FACE ? 'walk' : 'walk-mirrored';
    const src = this.frames[dir][this.frame]?.src;
    if (src && overlay.src !== src) overlay.src = src;
    overlay.style.transform = `translate(${c.x - CANVAS.w / 2}px, ${c.y - CANVAS.feet}px)`;
  };
}
