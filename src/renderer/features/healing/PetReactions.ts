/**
 * 쓰다듬기 반응 연출 (힐링 파트 전용).
 *
 * 다른 파트의 파일(index.ts / index.html / styles.css / 캐릭터 렌더러)은 수정하지 않는다.
 * 대신 화면에 이미 있는 #character 요소를 "읽기 전용으로 찾아서" Web Animations API로 움직인다.
 * (CSP가 인라인 <style>을 막아서 CSS 파일 대신 JS 애니메이션을 쓴다)
 *
 * 쓰다듬는 동안 세 동작을 차례로 반복한다:
 *   rub   (부비부비) : 손에 몸을 비비듯 좌우로 천천히 흔들림, 하트는 가끔
 *   laugh (웃음)     : 작게 파르르 떨며 'ㅎㅎ'가 떠오름
 *   hop   (총총)     : 3번 총총 뛰며 하트가 많이 나옴
 *
 * 인식은 손이 잠깐 가려지면 petting ↔ idle 이 깜빡일 수 있어서
 *  - 멈춤 신호가 와도 GRACE_MS 동안은 계속 반응하고,
 *  - 정말 멈추면 살짝 출렁이며 돌아오고,
 *  - 곧 다시 쓰다듬으면 하던 동작부터 이어간다.
 *
 * 캐릭터가 달리는 중(자세 반응)이거나 잠든 상태면 반응하지 않는다. 자세 반응이 우선이다.
 */
type Phase = 'rub' | 'laugh' | 'hop';

const SEQUENCE: { phase: Phase; ms: number; every: number }[] = [
  { phase: 'rub', ms: 1700, every: 650 }, //   every = 효과(하트/글자)가 나오는 간격(ms)
  { phase: 'laugh', ms: 1100, every: 320 },
  { phase: 'hop', ms: 1350, every: 240 } //     총총 3번(450ms × 3)
];
const MOTIONS: Record<Phase, { frames: Keyframe[]; options: KeyframeAnimationOptions }> = {
  rub: {
    frames: [
      { transform: 'translateX(-9px) rotate(-5deg) scale(1.03, 0.97)' },
      { transform: 'translateX(9px) rotate(5deg) scale(1.03, 0.97)' }
    ],
    options: { duration: 700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }
  },
  laugh: {
    frames: [
      { transform: 'translateY(0) scale(1.06, 0.95) rotate(-1.5deg)' },
      { transform: 'translateY(-5px) scale(1.04, 0.98) rotate(1.5deg)' }
    ],
    options: { duration: 160, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }
  },
  hop: {
    frames: [
      { transform: 'translateY(0) scale(1.04, 0.94)', offset: 0 },
      { transform: 'translateY(-22px) scale(0.97, 1.05)', offset: 0.5 },
      { transform: 'translateY(0) scale(1.04, 0.94)', offset: 1 }
    ],
    options: { duration: 450, iterations: 3, easing: 'ease-in-out' }
  }
};
const SETTLE_FRAMES: Keyframe[] = [
  { transform: 'scale(1.04, 0.95)' },
  { transform: 'scale(0.98, 1.03)', offset: 0.4 },
  { transform: 'scale(1.01, 0.99)', offset: 0.7 },
  { transform: 'none' }
];
const GRACE_MS = 800; //          이 시간 안에 다시 인식되면 끊긴 적 없는 것으로 친다
const RESUME_WITHIN_MS = 4000; // 이 시간 안에 다시 쓰다듬으면 하던 동작부터 이어서
const HEAD_OFFSET_Y = 55; //      캐릭터 머리 높이(캐릭터 영역 위쪽 기준 px). 하트가 시작되는 곳
const HEART_SPREAD = 90; //       하트가 퍼지는 가로 폭(px)

export class PetReactions {
  private wanted = false; //     인식 쪽이 "쓰다듬는 중"이라고 알려 줬는지
  private active = false; //     지금 연출 중인지
  private index = 0;
  private lastStopAt = 0;
  private motion: Animation | null = null;
  private layer: HTMLElement | null = null;
  private offTimer: ReturnType<typeof setTimeout> | undefined;
  private phaseTimer: ReturnType<typeof setTimeout> | undefined;
  private fxTimer: ReturnType<typeof setInterval> | undefined;
  private watcher: ReturnType<typeof setInterval> | undefined;

  /** 카메라가 시작될 때 호출. 조건(달리는 중 등)이 바뀌는 순간을 놓치지 않도록 주기적으로 확인한다. */
  attach(): void {
    if (this.watcher === undefined) this.watcher = setInterval(() => this.sync(), 100);
  }

  /** 카메라가 멈출 때 호출. 연출과 타이머를 모두 정리한다. */
  detach(): void {
    clearInterval(this.watcher);
    this.watcher = undefined;
    this.wanted = false;
    this.stopNow();
    this.layer?.remove();
    this.layer = null;
  }

  setPetting(on: boolean): void {
    this.wanted = on;
    this.sync();
  }

  private get pet(): HTMLElement | null {
    return document.querySelector<HTMLElement>('#character');
  }

  /** 캐릭터가 깨어 있고 제자리(중앙)에 있을 때만 반응한다. (다른 파트가 화면에 남긴 표시를 읽기만 한다) */
  private canReact(): boolean {
    const pet = this.pet;
    if (!pet || pet.dataset.state !== 'Awake') return false;
    return pet.querySelector<HTMLCanvasElement>('canvas')?.dataset.atHome !== 'false';
  }

  private sync(): void {
    const on = this.wanted && this.canReact();
    if (on) {
      clearTimeout(this.offTimer); // 멈춤 예약이 있었다면 취소 (잠깐 끊긴 것뿐)
      this.offTimer = undefined;
      if (this.active) return; //     이미 연출 중이면 끊지 않는다
      this.active = true;
      // 방금 멈춘 거라면 이어서, 오래됐으면 처음(부비부비)부터
      if (performance.now() - this.lastStopAt > RESUME_WITHIN_MS) this.index = 0;
      this.runPhase();
    } else if (this.active && this.offTimer === undefined) {
      if (!this.canReact()) this.finish(false); // 달리기 등으로 불가능해지면 기다리지 않고 바로 정리
      else this.offTimer = setTimeout(() => this.finish(true), GRACE_MS);
    }
  }

  private runPhase(): void {
    const pet = this.pet;
    if (!pet) return;
    const step = SEQUENCE[this.index]!;
    pet.style.transformOrigin = '50% 100%'; // 발바닥 중앙 기준으로 움직이게
    this.motion?.cancel();
    this.motion = pet.animate(MOTIONS[step.phase].frames, MOTIONS[step.phase].options);

    clearInterval(this.fxTimer);
    this.spawn(step.phase);
    this.fxTimer = setInterval(() => this.spawn(step.phase), step.every);

    this.phaseTimer = setTimeout(() => {
      this.index = (this.index + 1) % SEQUENCE.length; // 다 끝나면 처음(부비부비)으로
      this.runPhase();
    }, step.ms);
  }

  private stopNow(): void {
    clearTimeout(this.offTimer);
    clearTimeout(this.phaseTimer);
    clearInterval(this.fxTimer);
    this.offTimer = undefined;
    this.active = false;
    this.motion?.cancel();
    this.motion = null;
  }

  private finish(settle: boolean): void {
    this.stopNow();
    this.lastStopAt = performance.now();
    const pet = this.pet;
    if (settle && pet) {
      this.motion = pet.animate(SETTLE_FRAMES, { duration: 400, easing: 'ease-out' }); // 뚝 끊기지 않게 살짝 출렁이며 복귀
      this.motion.onfinish = () => { this.motion = null; };
    }
  }

  private spawn(phase: Phase): void {
    const pet = this.pet;
    if (!pet) return;
    if (!this.layer) {
      this.layer = document.createElement('div');
      Object.assign(this.layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
      document.body.append(this.layer);
    }
    const el = document.createElement('span');
    el.textContent = phase === 'laugh' ? (Math.random() < 0.5 ? 'ㅎㅎ' : '✨')
      : phase === 'rub' ? '💗' : Math.random() < 0.75 ? '❤️' : '💗';
    Object.assign(el.style, {
      position: 'fixed', pointerEvents: 'none',
      fontSize: phase === 'laugh' ? '22px' : '26px',
      fontWeight: phase === 'laugh' ? '700' : '400',
      color: '#e8689a',
      textShadow: phase === 'laugh' ? '0 0 3px white, 0 0 5px white' : 'none',
      // 캐릭터는 가로 중앙(home), 화면 아래쪽에 있다. 머리 위에서 퍼져 나간다.
      left: `${window.innerWidth / 2 + (Math.random() - 0.5) * HEART_SPREAD}px`,
      top: `${window.innerHeight - pet.offsetHeight + HEAD_OFFSET_Y}px`
    });
    this.layer.append(el);
    const rise = el.animate([
      { opacity: 1, transform: 'translate(-50%, 0) scale(0.6)' },
      { opacity: 0, transform: 'translate(-50%, -100px) scale(1.2)' }
    ], { duration: phase === 'laugh' ? 1000 : 1300, easing: 'ease-out' });
    rise.onfinish = () => el.remove();
  }
}
