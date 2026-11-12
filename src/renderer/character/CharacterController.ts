import type { CharacterState, HealingResult, PostureResult } from '../shared/types/index.ts';

/** Stores recognition inputs independently of any rendering library. */
export class CharacterController {
  state: CharacterState = 'Awake';
  posture: PostureResult = { state: 'unavailable', intensity: 0 };
  healing: HealingResult = { state: 'idle' };

  setState(state: CharacterState): void { this.state = state; }
  updatePosture(result: PostureResult): void { this.posture = result; }
  updateHealing(result: HealingResult): void { this.healing = result; }
  resetRecognition(): void {
    this.posture = { state: 'unavailable', intensity: 0 };
    this.healing = { state: 'idle' };
  }
}
