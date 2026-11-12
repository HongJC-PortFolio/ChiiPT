import { CharacterController } from '../../character/CharacterController.ts';
import { CameraManager } from '../camera/CameraManager.ts';
import type { FeatureModule } from '../types/index.ts';

/** Only this coordinator attaches the shared stream to feature modules. */
export class AppRuntime {
  private camera: CameraManager;
  private character: CharacterController;
  private features: FeatureModule[];
  private boundStream: MediaStream | null = null;
  private unsubscribe: () => void;
  private cameraRequested = false;
  selectedDeviceId = '';

  constructor(camera: CameraManager, character: CharacterController, features: FeatureModule[]) {
    this.camera = camera;
    this.character = character;
    this.features = features;
    this.unsubscribe = camera.subscribe((_state, stream) => {
      if (stream === this.boundStream) return;
      this.features.forEach(feature => feature.stop());
      this.boundStream = stream;
      if (stream) this.features.forEach(feature => feature.start(stream));
      else this.character.resetRecognition();
    });
  }
  async startCamera(): Promise<void> {
    if (this.character.state !== 'Awake') return;
    this.cameraRequested = true;
    await this.camera.start(this.selectedDeviceId);
  }
  stopCamera(): void { this.cameraRequested = false; this.camera.stop(); }
  async selectCamera(deviceId: string): Promise<void> {
    const restart = this.cameraRequested && this.character.state === 'Awake';
    this.selectedDeviceId = deviceId;
    this.camera.stop();
    if (restart) await this.startCamera();
  }
  sleep(): void {
    if (this.character.state !== 'Awake') return;
    this.character.setState('FallingAsleep');
    this.camera.stop();
    // No animation yet; transitions complete immediately in this foundation.
    this.character.setState('Sleep');
  }
  async wake(): Promise<void> {
    if (this.character.state !== 'Sleep') return;
    this.character.setState('WakingUp');
    this.character.setState('Awake');
    if (this.cameraRequested) await this.startCamera();
  }
  dispose(): void {
    this.stopCamera();
    this.unsubscribe();
    this.features.forEach(feature => feature.stop());
  }
}
