const PULL_FRAME_COUNT = 29;
const RELEASE_FRAME_COUNT = 17;
const FRAME_MS = 55;

/** Plays the supplied cheek-pull artwork while a pinch is held, then releases it. */
export class CheekPinchReaction {
  private pinching = false;
  private mirrored = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sequence = 0;

  setPinching(on: boolean, mirrored = false): void {
    if (this.pinching === on) {
      if (on && this.mirrored !== mirrored) {
        this.mirrored = mirrored;
        this.applyMirror();
      }
      return;
    }
    this.pinching = on;
    if (on) {
      this.mirrored = mirrored;
      this.applyMirror();
      this.play('cheek-pull', PULL_FRAME_COUNT);
    } else {
      // Keep the direction through the release so the pulled cheek returns on
      // the same side; reset it once the release animation has finished.
      this.play('cheek-release', RELEASE_FRAME_COUNT, () => {
        this.mirrored = false;
        this.applyMirror();
      });
    }
  }

  detach(): void {
    this.pinching = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.sequence++;
    this.mirrored = false;
    this.applyMirror();
  }

  private play(animation: 'cheek-pull' | 'cheek-release', frameCount: number, onComplete?: () => void): void {
    clearTimeout(this.timer);
    const sequence = ++this.sequence;
    let frame = 1;
    const showNext = (): void => {
      if (sequence !== this.sequence) return;
      this.showFrame(animation, frame);
      if (frame++ < frameCount) this.timer = setTimeout(showNext, FRAME_MS);
      else onComplete?.();
    };
    showNext();
  }

  private showFrame(animation: 'cheek-pull' | 'cheek-release', frame: number): void {
    const image = document.querySelector<HTMLImageElement>('#character-frame');
    if (!image) return;
    const src = new URL(
      `assets/characters/${animation}/${animation}-frame-${String(frame).padStart(2, '0')}.png`,
      document.baseURI
    ).href;
    if (image.src !== src) image.src = src;
  }

  private applyMirror(): void {
    const image = document.querySelector<HTMLImageElement>('#character-frame');
    if (image) image.style.transform = this.mirrored ? 'scaleX(-1)' : '';
  }
}
