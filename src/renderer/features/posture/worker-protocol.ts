import type { PoseFrame, PostureDetectorOptions } from './detector.ts';
export type PoseWorkerRequest =
  | { type: 'init'; options: Omit<PostureDetectorOptions, 'onResults' | 'onError'> }
  | { type: 'frame'; bitmap: ImageBitmap; timestampMs: number };
export type PoseWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; frame: PoseFrame }
  | { type: 'error'; message: string };
