/**
 * 산책: 캐릭터가 마우스 커서를 따라 화면 어디든(좌우·상하·대각선) 걸어간다.
 * 커서에서 stopDistance 안쪽까지 오면 멈추고, 커서가 startDistance보다 멀어지면 다시 걷는다.
 * (두 값을 다르게 둔 이유: 경계에서 걷다 멈췄다를 반복하는 떨림을 막기 위한 히스테리시스)
 * 숫자는 모두 임시값. 직접 해 보면서 조절한다. (초당 픽셀 단위라서 화면 크기·컴퓨터 성능과 상관없이 같은 속도)
 */
export const walkSettings = {
  stopDistance: 90, //  이 거리 안으로 들어오면 멈춤(px)
  startDistance: 120, // 이 거리보다 멀어지면 다시 걷기 시작(px)
  maxSpeed: 300, //     최대 속도(px/초)  (다리 짧은 캐릭터가 총총 따라오는 느낌. 이전: 처음 420 · 빠르게 800 · 직전 500)
  minSpeed: 55, //      거의 다 와서도 이 속도 밑으로는 느려지지 않음
  slowdown: 2.4, //     멀수록 빨라지는 정도
  headroom: 175, //     발바닥이 화면 위쪽에서 이만큼은 내려와 있어야 몸이 안 잘림
  margin: 70 //         좌우 여유
};

export class WalkController {
  x = 0;
  y = 0;
  enabled = false;
  moving = false;
  /** 이동 방향. 좌/우 걷기 프레임을 고르는 데 쓴다. */
  facing: 'left' | 'right' = 'right';
  target: { x: number; y: number } | null = null;
  /** 산책을 끄면 돌아가는 기준 위치(화면 아래 가운데). 호출 측이 화면 크기에 맞춰 정해 준다. */
  home: { x: number; y: number } = { x: 0, y: 0 };

  update(dt: number, bounds: { w: number; h: number }): void {
    const s = walkSettings;
    // 산책 중이면 커서를 따라가고, 꺼져 있으면 기준 위치(home)로 걸어 돌아간다
    const goal = this.enabled ? this.target : this.home;
    const stop = this.enabled ? s.stopDistance : 3; //      home에는 거의 정확히 도착
    const start = this.enabled ? s.startDistance : 6;
    if (goal) {
      // 갈 수 없는 곳(화면 맨 위, 화면 밖)에 커서가 있어도 제자리에서 허우적대지 않게, 목표를 갈 수 있는 범위 안으로 맞춘다
      const tx = Math.min(bounds.w - s.margin, Math.max(s.margin, goal.x));
      const ty = Math.min(bounds.h - 6, Math.max(s.headroom, goal.y));
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      // +1: 정확히 stop 거리에 도착한 뒤 소수점 오차 때문에 계속 "걷는 중"으로 남는 것을 막는다
      if (dist <= (this.moving ? stop + 1 : start)) {
        this.moving = false;
        if (!this.enabled) { this.x = tx; this.y = ty; } // 산책을 끄고 돌아왔을 때는 원래 자리에 딱 맞춘다
      } else {
        this.moving = true;
        const speed = Math.min(s.maxSpeed, (dist - stop) * s.slowdown + s.minSpeed);
        const step = Math.min(speed * dt, dist - stop);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        if (Math.abs(dx) > 4) this.facing = dx < 0 ? 'left' : 'right';
      }
    } else {
      this.moving = false;
    }
    this.x = Math.min(bounds.w - s.margin, Math.max(s.margin, this.x));
    this.y = Math.min(bounds.h - 6, Math.max(s.headroom, this.y));
  }
}
