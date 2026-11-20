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
  createHealingFeature(result => {
    character.updateHealing(result);
    render();
  })
]);
const pet = document.querySelector<HTMLButtonElement>('#character')!;
const characterFrame = document.querySelector<HTMLImageElement>('#character-frame')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let devices: CameraDevice[] = [];
let deviceError = '';
let interactive = false;
let pressTimer: ReturnType<typeof setTimeout> | undefined;

function healingStatus(): string {
  switch (character.healing.state) {
    case 'hand-detected': return '손 감지됨';
    case 'petting': return '쓰다듬기 감지!';
    case 'pinching': return '볼 꼬집기 감지!';
    case 'error': return `손동작 인식 오류: ${character.healing.message ?? '초기화 실패'}`;
    default: return '손동작 대기 중';
  }
}

function render(): void {
  pet.dataset.state = character.state;
  pet.dataset.healing = character.healing.state;
  // 산책 중에는 WalkFeature가 별도 PNG 프레임을 올린다. 그 외 상태는
  // 기본 캐릭터 PNG를 버튼 안에 유지해 임시 원형이 나타나지 않게 한다.
  const animation = character.state === 'Sleep' ? 'sleep' : 'idle-open';
  const frame = character.state === 'Sleep' ? 1 : 1;
  const src = new URL(`assets/characters/${animation}/${animation}-frame-${String(frame).padStart(2, '0')}.png`, document.baseURI).href;
  if (characterFrame.src !== src) characterFrame.src = src;
  status.textContent = `${character.state} · 카메라 ${camera.state.status} · ${healingStatus()}${camera.state.error ? ` · ${camera.state.error}` : ''}${deviceError ? ` · ${deviceError}` : ''}`;
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
