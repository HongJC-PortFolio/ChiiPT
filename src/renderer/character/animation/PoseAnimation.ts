export type Direction = -1 | 0 | 1;
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

/** Renderer-independent pose transition; inputs come from CharacterController. */
export class PoseAnimation {
  value = 0;
  private target: Direction = 0;
  private from = 0;
  private elapsed = 0;
  private duration = 1;

  setDirection(direction: Direction): void {
    if (direction === this.target) return;
    this.from = this.value;
    this.target = direction;
    this.elapsed = 0;
    this.duration = Math.max(0.4, Math.abs(direction - this.from) * 1.15);
  }

  update(dt: number) {
    this.elapsed += Math.max(0, dt);
    this.value = this.from + (this.target - this.from) * smooth(this.elapsed / this.duration);
    const amount = Math.abs(this.value), side = Math.sign(this.value);
    const blend = smooth((amount - 0.25) / 0.45);
    return {
      angle: side * (0.22 * smooth(amount / 0.45) + 0.9 * smooth((amount - 0.45) / 0.55)),
      x: side * 25 * smooth(amount),
      weights: [1 - blend, side < 0 ? blend : 0, side > 0 ? blend : 0],
      squash: 0.06 * Math.sin(Math.PI * smooth((amount - 0.65) / 0.35))
    };
  }
}
