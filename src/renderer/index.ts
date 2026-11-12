import { CharacterController } from './character/CharacterController.ts';
import { createPostureFeature } from './features/posture/index.ts';
import { createHealingFeature } from './features/healing/index.ts';
import { CameraManager } from './shared/camera/CameraManager.ts';
import { AppRuntime } from './shared/state/AppRuntime.ts';
import type { AppCommand, CameraDevice } from './shared/types/index.ts';

const character = new CharacterController();
const camera = new CameraManager(navigator.mediaDevices);
const runtime = new AppRuntime(camera, character, [
  createPostureFeature(result => character.updatePosture(result)),
  createHealingFeature(result => character.updateHealing(result))
]);
const pet = document.querySelector<HTMLButtonElement>('#character')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let devices: CameraDevice[] = [];
let deviceError = '';
let interactive = false;
let pressTimer: ReturnType<typeof setTimeout> | undefined;

function render(): void {
  pet.dataset.state = character.state;
  pet.textContent = character.state === 'Sleep' ? '－ᴗ－' : '●ᴗ●';
  status.textContent = `${character.state} · 카메라 ${camera.state.status}${camera.state.error ? ` · ${camera.state.error}` : ''}${deviceError ? ` · ${deviceError}` : ''}`;
  window.chiipt.publish({ character: character.state, camera: camera.state, selectedDeviceId: runtime.selectedDeviceId, devices });
}
async function refreshDevices(): Promise<void> {
  try { devices = await camera.devices(); deviceError = ''; }
  catch { deviceError = '장치 목록을 읽을 수 없습니다.'; }
  render();
}
async function command(command: AppCommand): Promise<void> {
  switch (command.type) {
    case 'camera-start': await runtime.startCamera(); await refreshDevices(); break;
    case 'camera-stop': runtime.stopCamera(); break;
    case 'sleep': runtime.sleep(); break;
    case 'wake': await runtime.wake(); await refreshDevices(); break;
    case 'refresh-devices': await refreshDevices(); break;
    case 'select-camera': await runtime.selectCamera(command.deviceId); await refreshDevices(); break;
  }
  render();
}
function setInteractive(value: boolean): void {
  if (value === interactive) return;
  interactive = value;
  window.chiipt.setInteractive(value);
}
function cancelPress(): void { clearTimeout(pressTimer); pressTimer = undefined; }
// Circular hit test excludes even the transparent corners of the button's box.
window.addEventListener('pointermove', event => {
  const rect = pet.getBoundingClientRect();
  const inside = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2) <= rect.width / 2;
  if (!inside) cancelPress();
  setInteractive(inside);
});
document.documentElement.addEventListener('pointerleave', () => { cancelPress(); setInteractive(false); });
window.addEventListener('blur', () => { cancelPress(); setInteractive(false); });
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0 || character.state !== 'Awake') return;
  cancelPress();
  pressTimer = setTimeout(() => void command({ type: 'sleep' }), 2000);
});
window.addEventListener('pointerup', cancelPress);
window.addEventListener('pointercancel', cancelPress);
pet.addEventListener('dblclick', () => void command({ type: 'wake' }));
pet.addEventListener('contextmenu', event => { event.preventDefault(); cancelPress(); window.chiipt.showMenu(); });
pet.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.chiipt.showMenu(); }
});
const unsubscribeCamera = camera.subscribe(() => render());
const unsubscribeCommands = window.chiipt.onCommand(value => void command(value));
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
window.addEventListener('beforeunload', () => {
  cancelPress(); unsubscribeCommands(); unsubscribeCamera();
  navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  runtime.dispose();
});
void refreshDevices();
