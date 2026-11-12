import type { FeatureModule, HealingResult } from '../../shared/types/index.ts';

/** Healing team entry point. Attach inference to the borrowed stream here. */
export function createHealingFeature(_emit: (result: HealingResult) => void): FeatureModule {
  return {
    id: 'healing',
    start(_stream) { /* Placeholder: no Hand Landmarker or gesture analysis. */ },
    stop() { /* Release this feature's future workers/timers, never shared tracks. */ }
  };
}
