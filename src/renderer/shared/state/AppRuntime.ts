import { CharacterController } from '../../character/CharacterController.ts';
import { CameraManager } from '../camera/CameraManager.ts';
import type { FeatureModule, FeatureMode } from '../types/index.ts';

/** Only this coordinator attaches the shared stream to feature modules. */
export class AppRuntime {
  private camera: CameraManager;
  private character: CharacterController;
  private features: FeatureModule[];
  private boundStream: MediaStream | null = null;
  private unsubscribe: () => void;
  private cameraRequested = false;
  selectedDeviceId = '';
  mode: FeatureMode = 'posture';
  private wakeAbort: AbortController | null = null;
  private wakeTask: Promise<void> | null = null;
  private playWake: (signal: AbortSignal) => Promise<void>;
  constructor(camera: CameraManager, character: CharacterController, features: FeatureModule[], playWake: (signal: AbortSignal) => Promise<void> = async () => {}) {
    this.playWake = playWake;
    this.camera = camera;
    this.character = character;
    this.features = features;
    this.unsubscribe = camera.subscribe((_state, stream) => {
      if (stream === this.boundStream) return;
      this.features.forEach(feature => feature.stop());
      this.boundStream = stream;
      if (stream && this.mode !== 'off') this.features.find(feature => feature.id === this.mode)?.start(stream);
      else this.character.resetRecognition();
    });
  }
  async selectMode(mode: FeatureMode): Promise<void> {
    if (!['posture', 'healing', 'off'].includes(mode)) return;
    if (mode !== this.mode) {
      this.mode = mode;
      this.features.forEach(feature => feature.stop());
      this.character.resetRecognition();
      // Posture movement yields to a neutral return before healing can react.
      this.character.updatePosture({ state: 'neutral', intensity: 0 });
      if (mode !== 'off' && this.boundStream && this.character.state === 'Awake') {
        this.features.find(feature => feature.id === mode)?.start(this.boundStream);
      }
    }
    if (mode === 'off') { this.sleep(); this.stopCamera(); return; }
    this.cameraRequested = true;
    if (this.character.state === 'Sleep' || this.character.state === 'WakingUp') await this.wake();
    else await this.startCamera();
  }
  async startCamera(): Promise<void> {
    if (this.character.state !== 'Awake' || this.mode === 'off') return;
    this.cameraRequested = true;
    await this.camera.start(this.selectedDeviceId);
  }
  stopCamera(): void {
    this.cameraRequested = false;
    if(this.character.state==='WakingUp'){this.wakeAbort?.abort();this.character.setState('Sleep');}
    this.camera.stop();
  }
  async selectCamera(deviceId: string): Promise<void> {
    const restart = this.cameraRequested && this.character.state === 'Awake';
    this.selectedDeviceId = deviceId;
    this.camera.stop();
    if (restart) await this.startCamera();
  }
  sleep(): void {
    if (this.character.state !== 'Awake' && this.character.state !== 'WakingUp') return;
    this.wakeAbort?.abort();
    this.character.setState('FallingAsleep');
    this.camera.stop();
    // No animation yet; transitions complete immediately in this foundation.
    this.character.setState('Sleep');
  }
  async wake(): Promise<void> {
    if(this.character.state==='WakingUp')return this.wakeTask ?? undefined;
    if (this.character.state !== 'Sleep') return;
    const abort=new AbortController();this.wakeAbort=abort;
    this.character.setState('WakingUp');
    const task=(async()=>{
      try {
        await this.playWake(abort.signal);
        if(abort.signal.aborted)return;
        this.character.setState('Awake');
        if(this.cameraRequested)await this.startCamera();
      } catch(error) {
        if(!abort.signal.aborted){this.character.setState('Sleep');console.error('[Wake]',error);}
      }
    })();
    this.wakeTask=task;await task;
    if(this.wakeTask===task){this.wakeTask=null;this.wakeAbort=null;}
  }
  dispose(): void {
    this.stopCamera();
    this.unsubscribe();
    this.features.forEach(feature => { feature.stop(); feature.dispose?.(); });
  }
}
