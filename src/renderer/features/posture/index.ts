import type { FeatureModule, PostureResult } from '../../shared/types/index.ts';

/** Posture team entry point. Attach inference to the borrowed stream here. */
export function createPostureFeature(_emit: (result: PostureResult) => void): FeatureModule {
  return {
    id: 'posture',
    start(_stream) { /* Placeholder: no Pose Landmarker or posture analysis. */ },
    stop() { /* Release this feature's future workers/timers, never shared tracks. */ }
  };
}
