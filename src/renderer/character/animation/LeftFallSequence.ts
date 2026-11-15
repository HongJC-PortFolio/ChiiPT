// Original files are copied unchanged. Rectangles exclude empty margins and isolated outer residue.
export const leftFallFrames = [
  { file: 'frame-01.png', x: 708, y: 84, w: 553, h: 595, duration: .24 },
  { file: 'frame-02.png', x: 580, y: 115, w: 559, h: 559, duration: .20 },
  { file: 'frame-03.png', x: 392, y: 191, w: 565, h: 550, duration: .20 },
  { file: 'frame-04.png', x: 258, y: 358, w: 705, h: 467, duration: .12 },
  { file: 'frame-05.png', x: 261, y: 333, w: 659, h: 506, duration: .24 },
  { file: 'frame-06.png', x: 411, y: 346, w: 678, h: 484, duration: .24 },
  { file: 'frame-07.png', x: 436, y: 371, w: 722, h: 449, duration: .20 },
  { file: 'frame-08.png', x: 467, y: 377, w: 713, h: 448, duration: .48 }
] as const;
export const leftFallDuration = leftFallFrames.reduce((total, frame) => total + frame.duration, 0);
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** One-shot playback, final-frame hold, and a neutral crossfade on release. */
export class LeftFallSequence {
  private active = false;
  private elapsed = 0;
  private transitionTime = 0;
  private fromOpacity = 0;
  opacity = 0;
  private travel = 0;
  private fromTravel = 0;

  update(dt: number, active: boolean, distance = 32) {
    // User-selected time divisor; preserve playback and recovery speed.
    dt = Math.max(0, dt) / 10;
    if (active !== this.active) {
      if (active && this.opacity < .001) this.elapsed = 0;
      this.active = active;
      this.transitionTime = 0;
      this.fromOpacity = this.opacity;
      this.fromTravel = this.travel;
    }
    this.transitionTime += dt;
    this.opacity = this.fromOpacity + ((active ? 1 : 0) - this.fromOpacity) * ease(this.transitionTime / (active ? .18 : .9));
    if (active) this.elapsed = Math.min(leftFallDuration, this.elapsed + dt);
    let remaining = this.elapsed;
    let index = 0;
    while (index < leftFallFrames.length - 1 && remaining >= leftFallFrames[index]!.duration) {
      remaining -= leftFallFrames[index]!.duration; index++;
    }
    // Accelerate through imbalance/impact, then coast to a zero-velocity stop.
    const t = Math.min(1, this.transitionTime / leftFallDuration);
    const impact = .64 / leftFallDuration;
    const path = t < impact ? t * t / impact : 1 - (1 - t) ** 2 / (1 - impact);
    this.travel = active
      ? this.fromTravel + (1 - this.fromTravel) * path
      : this.fromTravel * (1 - ease(this.transitionTime / .9));
    const hop = index < 3 ? Math.sin(Math.PI * Math.min(1, this.elapsed / .64)) * 6 : 0;
    // Continuous secondary motion between the eight original drawings.
    const progress = Math.min(1, remaining / leftFallFrames[index]!.duration);
    const angles = [0, -3, -8, -12, 3, -2, 1, 0, 0];
    const rotation = (angles[index]! + (angles[index + 1]! - angles[index]!) * ease(progress)) * Math.PI / 180 * this.opacity;
    const squash = index === 3 ? Math.sin(Math.PI * progress) * .065 * this.opacity
      : index === 4 ? -Math.sin(Math.PI * progress) * .025 * this.opacity : 0;
    return { rotation, squash, progress, index, opacity: this.opacity, x: this.travel === 0 ? 0 : -Math.max(0, distance) * this.travel, lift: active ? hop : hop * this.opacity };
  }
}
