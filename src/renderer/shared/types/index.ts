export type CharacterState = 'Awake' | 'FallingAsleep' | 'Sleep' | 'WakingUp';
export type CameraStatus = 'stopped' | 'starting' | 'running' | 'error';
export interface CameraDevice { deviceId: string; label: string }
export interface CameraState { status: CameraStatus; error: string | null }

// Recognition contracts only. No detection algorithm is implemented.
export interface PostureResult { state: 'neutral' | 'left' | 'right' | 'unavailable'; intensity: number }
export interface HealingResult { state: 'idle' | 'petting' }
/** Borrowed stream: features must not call getUserMedia() or stop its tracks. */
export interface FeatureModule {
  readonly id: 'posture' | 'healing';
  start(stream: MediaStream): void;
  stop(): void;
}
export type AppCommand =
  | { type: 'camera-start' | 'camera-stop' | 'sleep' | 'wake' | 'refresh-devices' }
  | { type: 'select-camera'; deviceId: string };
export interface AppSnapshot {
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
