export type CharacterState = 'Awake' | 'FallingAsleep' | 'Sleep' | 'WakingUp';
export type FeatureMode = 'posture' | 'healing' | 'off';
export type CameraStatus = 'stopped' | 'starting' | 'running' | 'error';
export interface CameraDevice { deviceId: string; label: string }
export interface CameraState { status: CameraStatus; error: string | null }

// Recognition contracts only. No detection algorithm is implemented.
export interface PostureResult { state: 'neutral' | 'left' | 'right' | 'unavailable'; intensity: number }
export interface HealingResult { state: 'idle' | 'hand-detected' | 'petting' | 'pinching' | 'error'; message?: string }
/** Borrowed stream: features must not call getUserMedia() or stop its tracks. */
export interface FeatureModule {
  readonly id: 'posture' | 'healing';
  start(stream: MediaStream): void;
  stop(): void;
  dispose?(): void;
}
export type AppCommand =
  | { type: 'camera-start' | 'camera-stop' | 'sleep' | 'wake' | 'stretch' | 'refresh-devices' }
  | { type: 'set-walk'; on: boolean }
  | { type: 'select-mode'; mode: FeatureMode }
  | { type: 'select-camera'; deviceId: string };
export interface AppSnapshot {
  walkOn?: boolean;
  mode: FeatureMode;
  character: CharacterState;
  camera: CameraState;
  selectedDeviceId: string;
  devices: CameraDevice[];
}
export interface DesktopBridge {
  setInteractive(interactive: boolean): void;
  showMenu(): void;
  publish(snapshot: AppSnapshot): void;
  onCommand(listener: (command: AppCommand) => void): () => void;
}
