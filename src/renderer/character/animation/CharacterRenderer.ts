import { LeftRunSequence } from './LeftRunSequence.ts';
import { prepareRunSprite } from './RunSprites.ts';
import type { CharacterController } from '../CharacterController.ts';

const height = 220, characterHeight = 150, floor = 205;

export class CharacterRenderer {
  readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private idleImages = Array.from({ length: 6 }, () => new Image());
  private idleSprites: HTMLCanvasElement[] = [];
  private idleBounds = { x: 0, y: 0, w: 1, h: 1 };
  private idleTime = 0;
  private run = new LeftRunSequence();
  private runImages = Array.from({ length: 16 }, () => new Image());
  private runSprites: HTMLCanvasElement[] = [];
  private runContours: { x: number; y: number }[][] = [];
  private frame = 0;
  private last = 0;
  private useRightMotion = false;
  private disposed = false;
  private controller: CharacterController;

  constructor(host: HTMLElement, controller: CharacterController) {
    this.controller = controller;
    this.canvas.width = innerWidth * Math.min(devicePixelRatio, 2);
    this.canvas.height = height * Math.min(devicePixelRatio, 2);
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })!;
    host.replaceChildren(this.canvas);
    this.runImages.forEach((image, i) => { image.src = new URL(`/assets/characters/${i < 8 ? 'left-run' : 'right-run'}/${i % 8 + 1}.png`, location.href).href; });
    this.idleImages.forEach((image, i) => { image.src = new URL(`/assets/characters/idle/idle-frame-${String(i + 1).padStart(2, '0')}.png`, location.href).href; });
    void Promise.all([...this.idleImages.map(image => image.decode()), ...this.runImages.map(image => image.decode())]).then(() => {
      if (this.disposed) return;
      this.runSprites = this.runImages.map(prepareRunSprite);
      this.idleSprites = this.idleImages.map(prepareRunSprite);
      // One common crop and scale prevents frame-to-frame changes in body size or floor position.
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      for (const sprite of this.idleSprites) {
        const pixels = sprite.getContext('2d')!.getImageData(0, 0, sprite.width, sprite.height).data;
        for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
          if (pixels[(y * sprite.width + x) * 4 + 3]! > 50) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1);
          }
        }
      }
      this.idleBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      this.runContours = this.runSprites.map((sprite, index) => {
        const pixels = sprite.getContext('2d')!.getImageData(0, 0, sprite.width, sprite.height).data;
        const points: { x: number; y: number }[] = [];
        const scale = characterHeight / 158;
        for (let y = 0; y < sprite.height; y++) {
          let first = -1, last = -1;
          for (let x = 0; x < sprite.width; x++) if (pixels[(y * sprite.width + x) * 4 + 3]! > 50) {
            if (first < 0) first = x; last = x;
          }
          if (first >= 0) for (const x of [first, last + 1]) points.push({ x: (x - (index < 8 ? 100 : 92)) * scale, y: (y + 1 - 188) * scale });
        }
        return points;
      });
      this.frame = window.setInterval(() => this.draw(performance.now()), 1000 / 60);
    }).catch(error => { if (!this.disposed) host.textContent = `캐릭터 이미지 로드 실패: ${String(error)}`; });
  }

  private draw = (now: number): void => {
    const dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    const posture = this.controller.posture;
    // CSS pixels, independent of the backing-store/device pixel ratio.
    const width = this.canvas.getBoundingClientRect().width;
    const ratio = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const home = width / 2;
    const runDistance = Math.max(0, home - 100 * characterHeight / 158 - 8);
    const runState = this.controller.state !== 'Awake' ? 'neutral' : posture.state;
    const running = this.run.update(dt, runState, posture.intensity, runDistance);
    const atHome = running.x === 0 && running.opacity === 0;
    const returning = running.state === 'neutral' && running.x !== 0;
    // Return with the same side's medium-tilt motion; only travel points toward home.
    if (running.state !== 'unavailable') this.useRightMotion = returning ? running.x > 0
      : running.velocity > 0 || (running.velocity === 0 && running.x > 0);
    const useRightMotion = this.useRightMotion;
    const spriteIndex = running.index + (useRightMotion ? 8 : 0);
    this.idleTime = atHome && this.controller.state === 'Awake' ? (this.idleTime + dt) % 4.62 : 0;
    const blinkDurations = [3.2, .08, .10, .08, .16, 1];
    let blinkTime = this.idleTime, idleFrame = 0;
    while (idleFrame < 5 && blinkTime >= blinkDurations[idleFrame]!) { blinkTime -= blinkDurations[idleFrame]!; idleFrame++; }
    const ctx = this.context;
    ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (running.opacity < 1) {
      ctx.save(); ctx.globalAlpha = 1 - running.opacity; ctx.translate(home + running.x, floor);
      ctx.fillStyle = 'rgba(55,45,35,0.15)'; ctx.beginPath(); ctx.ellipse(0, 3, 46, 6, 0, 0, Math.PI * 2); ctx.fill();
      const f = this.idleBounds, w = f.w * characterHeight / f.h;
      ctx.drawImage(this.idleSprites[idleFrame]!, f.x, f.y, f.w, f.h, -w / 2, -characterHeight, w, characterHeight);
      ctx.restore();
    }
    if (running.opacity > 0) {
      const scale = characterHeight / 158;
      ctx.save(); ctx.globalAlpha = running.opacity;
      const cos = Math.cos(running.rotation), sin = Math.sin(running.rotation);
      const projected = this.runContours[spriteIndex]!.map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
      const support = Math.max(...projected.map(p => p.y));
      const minX = Math.min(...projected.map(p => p.x)), maxX = Math.max(...projected.map(p => p.x));
      const center = Math.max(4 - minX, Math.min(width - 4 - maxX, home + running.x));
      ctx.translate(center, floor);
      ctx.fillStyle = 'rgba(55,45,35,0.15)'; ctx.beginPath(); ctx.ellipse(0, 3, 46, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Rotate around the feet, then keep the lowest opaque foot pixel on the floor.
      ctx.translate(0, -support);
      ctx.rotate(running.rotation);
      const sprite = this.runSprites[spriteIndex]!;
      ctx.drawImage(sprite, -(spriteIndex < 8 ? 100 : 92) * scale, -188 * scale, sprite.width * scale, sprite.height * scale);
      ctx.restore();
    }
    this.canvas.dataset.idleFrame = String(idleFrame);
    this.canvas.dataset.atHome = String(atHome);
    this.canvas.dataset.runAngle = String(running.rotation * 180 / Math.PI);
    this.canvas.dataset.runFrame = String(running.index);
    this.canvas.dataset.heldSeconds = String(running.heldSeconds);
    this.canvas.dataset.runTier = String(running.tier);
    this.canvas.dataset.runFps = String(running.fps);
    this.canvas.dataset.runOpacity = String(running.opacity);
    this.canvas.dataset.runDistance = String(runDistance);
    this.canvas.dataset.runVelocity = String(running.velocity);
    this.canvas.dataset.runAsset = spriteIndex < 8 ? 'left-run' : 'right-run';
    this.canvas.dataset.travelX = String(running.x);
    this.canvas.dataset.homeX = String(home);
  };

  /** Match clicks to the currently rendered silhouette instead of the old circle. */
  hitTest(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) * this.canvas.width / rect.width);
    const y = Math.floor((clientY - rect.top) * this.canvas.height / rect.height);
    return x >= 0 && y >= 0 && x < this.canvas.width && y < this.canvas.height && this.context.getImageData(x, y, 1, 1).data[3]! > 50;
  }
  dispose(): void { this.disposed = true; clearInterval(this.frame); }
}

