export const leftRunSettings = {
  mediumAfterSeconds: 10,
  strongAfterSeconds: 20,
  fps: [12, 20, 30],
  frameCount: 14,
  edgeTravelSeconds: 30,
  recognitionLossSeconds: 1,
  angles: [3, 8, 15], // degrees clockwise: lean right while moving left
  smoothingSeconds: .22,
  returnSpeed: 150,
  returnFps: 14
} as const;

/** Shared by both directions; all motion timers live here, in seconds. */
export class LeftRunSequence {
  x = 0;
  opacity = 0;
  private phase = 0;
  private velocity = 0;
  private fps: number = leftRunSettings.fps[0];
  private rotation = 0;
  private heldSeconds = 0;
  private heldDirection: 'left' | 'right' | null = null;
  private missingSeconds = 0;
  update(dt: number, state: 'left' | 'right' | 'neutral' | 'unavailable', _intensity: number, distance: number) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    distance = Math.max(0, distance);
    this.x = Math.max(-distance, Math.min(distance, this.x));
    // A short recognition gap freezes every animation property and the hold timer.
    const previousMissing = this.missingSeconds;
    this.missingSeconds = state === 'unavailable' ? this.missingSeconds + dt : 0;
    if (state === 'unavailable' && this.missingSeconds >= leftRunSettings.recognitionLossSeconds) {
      state = 'neutral';
      dt = Math.max(0, this.missingSeconds - Math.max(previousMissing, leftRunSettings.recognitionLossSeconds));
    }
    if (state === 'left' || state === 'right') {
      if (this.heldDirection !== state) this.heldSeconds = 0;
      this.heldDirection = state;
      this.heldSeconds += dt;
    } else if (state === 'neutral') {
      this.heldDirection = null;
      this.heldSeconds = 0;
    }
    const tier = this.heldSeconds < leftRunSettings.mediumAfterSeconds ? 0 :
      this.heldSeconds < leftRunSettings.strongAfterSeconds ? 1 : 2;
    const blend = 1 - Math.exp(-dt / leftRunSettings.smoothingSeconds);
    const direction = state === 'right' ? 1 : -1;
    if (state === 'left' || state === 'right') {
      this.fps += (leftRunSettings.fps[tier]! - this.fps) * blend;
      const targetAngle = -direction * leftRunSettings.angles[tier]! * Math.PI / 180;
      this.rotation += (targetAngle - this.rotation) * blend;
      this.velocity = direction * distance / leftRunSettings.edgeTravelSeconds;
      this.x = Math.max(-distance, Math.min(distance, this.x + this.velocity * dt));
      this.phase = (this.phase + this.fps * dt) % leftRunSettings.frameCount;
      this.opacity = Math.min(1, this.opacity + dt / .15);
    } else if (state === 'neutral') {
      if (this.x !== 0) {
        this.fps = leftRunSettings.returnFps;
        const homeDirection = -Math.sign(this.x);
        this.velocity = homeDirection * leftRunSettings.returnSpeed;
        this.rotation = homeDirection * 8 * Math.PI / 180;
        this.phase = (this.phase + this.fps * dt) % leftRunSettings.frameCount;
        this.x += homeDirection * Math.min(Math.abs(this.x), leftRunSettings.returnSpeed * dt);
        this.opacity = 1;
      }
      if (this.x === 0) { this.velocity = 0; this.rotation = 0; this.opacity = 0; }
    } else {
      // Recognition loss must not masquerade as neutral.
      this.velocity = 0;
    }
    return { state, heldSeconds: this.heldSeconds, tier, rotation: this.rotation, x: this.x, index: Math.floor(this.phase), opacity: this.opacity, fps: this.fps, velocity: this.velocity };
  }
}



