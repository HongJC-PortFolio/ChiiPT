
import { leftFallFrames, leftFallDuration } from './LeftFallSequence';

export const rightFallFrames = leftFallFrames;
export const rightFallDuration = leftFallDuration;

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Mirrored playback of the original left-fall sequence. */
export class RightFallSequence {
  private active = false;
  private elapsed = 0;
  private transitionTime = 0;
  private fromOpacity = 0;

  opacity = 0;

  private travel = 0;
  private fromTravel = 0;

  update(dt: number, active: boolean, distance = 32) {
    // Preserve original playback and recovery speed.
    dt = Math.max(0, dt) / 10;

    if (active !== this.active) {
      if (active && this.opacity < .001) {
        this.elapsed = 0;
      }

      this.active = active;
      this.transitionTime = 0;
      this.fromOpacity = this.opacity;
      this.fromTravel = this.travel;
    }

    this.transitionTime += dt;

    this.opacity =
      this.fromOpacity +
      ((active ? 1 : 0) - this.fromOpacity) *
        ease(this.transitionTime / (active ? .18 : .9));

    if (active) {
      this.elapsed = Math.min(
        rightFallDuration,
        this.elapsed + dt
      );
    }

    let remaining = this.elapsed;
    let index = 0;

    while (
      index < rightFallFrames.length - 1 &&
      remaining >= rightFallFrames[index]!.duration
    ) {
      remaining -= rightFallFrames[index]!.duration;
      index++;
    }

    const t = Math.min(1, this.transitionTime / rightFallDuration);
    const impact = .64 / rightFallDuration;

    const path =
      t < impact
        ? t * t / impact
        : 1 - (1 - t) ** 2 / (1 - impact);

    this.travel = active
      ? this.fromTravel + (1 - this.fromTravel) * path
      : this.fromTravel * (1 - ease(this.transitionTime / .9));

    const hop =
      index < 3
        ? Math.sin(
            Math.PI * Math.min(1, this.elapsed / .64)
          ) * 6
        : 0;

    const progress = Math.min(
      1,
      remaining / rightFallFrames[index]!.duration
    );

    // Mirror the original rotation angles.
    const angles = [0, 3, 8, 12, -3, 2, -1, 0, 0];

    const rotation =
      (angles[index]! +
        (angles[index + 1]! - angles[index]!) *
          ease(progress)) *
      Math.PI / 180 *
      this.opacity;

    const squash =
      index === 3
        ? Math.sin(Math.PI * progress) * .065 * this.opacity
        : index === 4
          ? -Math.sin(Math.PI * progress) * .025 * this.opacity
          : 0;

    return {
      rotation,
      squash,
      progress,
      index,
      opacity: this.opacity,

      // Opposite of LeftFallSequence.
      x: this.travel === 0
        ? 0
        : Math.max(0, distance) * this.travel,

      lift: active ? hop : hop * this.opacity
    };
  }
}
