import { CharacterRenderer } from './character/animation/CharacterRenderer.ts';
import { CharacterController } from './character/CharacterController.ts';
import { createPostureFeature } from './features/posture/index.ts';
import { createHealingFeature } from './features/healing/index.ts';
import { CameraManager } from './shared/camera/CameraManager.ts';
import { AppRuntime } from './shared/state/AppRuntime.ts';
import type { AppCommand, CameraDevice } from './shared/types/index.ts';

const character = new CharacterController();
const camera = new CameraManager(navigator.mediaDevices);
const pet = document.querySelector<HTMLButtonElement>('#character')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const animationMode = new URLSearchParams(location.search).has('animation');
const renderer = new CharacterRenderer(pet, character);
const runtime = new AppRuntime(camera, character, [
  createPostureFeature(result => { if (!animationMode && runtime.mode === 'posture') { character.updatePosture(result); render(); } },
    scale => renderer.setScale(!animationMode && runtime.mode === 'posture' ? scale : 1)),
  createHealingFeature(result => { if (runtime.mode === 'healing') { character.updateHealing(result); render(); } })
], async signal => { render(); await renderer.playWake(signal); });
pet.setAttribute('aria-label', '치이카와 캐릭터. 우클릭으로 제어 메뉴 열기');
let devices: CameraDevice[] = [];
let deviceError = '';
let interactive = false;
let pressTimer: ReturnType<typeof setTimeout> | undefined;

function render(): void {
  pet.dataset.state = character.state;
  pet.dataset.mode = runtime.mode;
  pet.dataset.healing = character.healing.state;
  if(runtime.mode!=='healing'||character.state!=='Awake')renderer.setWalking(false);
  status.textContent = `${character.state} · 모드 ${runtime.mode} · 힐링 ${character.healing.state}${character.healing.message ? ` (${character.healing.message})` : ''} · 자세 ${character.posture.state} · 카메라 ${camera.state.status}${camera.state.error ? ` · ${camera.state.error}` : ''}${deviceError ? ` · ${deviceError}` : ''}`;
  window.chiipt.publish({ walkOn: renderer.walkingEnabled, mode: runtime.mode, character: character.state, camera: camera.state, selectedDeviceId: runtime.selectedDeviceId, devices });
}
async function refreshDevices(): Promise<void> {
  try { devices = await camera.devices(); deviceError = ''; }
  catch { deviceError = '장치 목록을 읽을 수 없습니다.'; }
  render();
}
async function command(command: AppCommand): Promise<void> {
  switch (command.type) {
    case 'select-mode': if (!animationMode) await runtime.selectMode(command.mode); break;
    case 'camera-start': await runtime.startCamera(); await refreshDevices(); break;
    case 'camera-stop': runtime.stopCamera(); break;
    case 'set-walk': renderer.setWalking(command.on); break;
    case 'stretch': renderer.playStretch(); break;
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
// Match interactive pixels to the current animated silhouette.
window.addEventListener('pointermove', event => {
  const inside = renderer.hitTest(event.clientX, event.clientY);
  if (!inside) cancelPress();
  setInteractive(inside);
});
document.documentElement.addEventListener('pointerleave', () => { cancelPress(); setInteractive(false); });
window.addEventListener('blur', () => { cancelPress(); setInteractive(false); });
pet.addEventListener('pointerdown', event => {
  if (animationMode || event.button !== 0 || character.state !== 'Awake') return;
  cancelPress();
  pressTimer = setTimeout(() => void command({ type: 'sleep' }), 2000);
});
window.addEventListener('pointerup', cancelPress);
window.addEventListener('pointercancel', cancelPress);
pet.addEventListener('dblclick', () => void command({ type: 'wake' }));
pet.addEventListener('contextmenu', event => { event.preventDefault(); cancelPress(); window.chiipt.showMenu(); });
pet.addEventListener('keydown', event => {
  if (!animationMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); window.chiipt.showMenu(); }
});
const unsubscribeCamera = camera.subscribe(() => render());
const unsubscribeCommands = window.chiipt.onCommand(value => void command(value));
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
window.addEventListener('beforeunload', () => {
  cancelPress(); unsubscribeCommands(); unsubscribeCamera();
  navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  renderer.dispose();
  runtime.dispose();
});
if (animationMode) {
  document.body.classList.add('animation-test');
  document.title = 'ChiiPT · 캐릭터 모션 테스트';
  document.querySelector('.hint')!.textContent = '← / → 또는 A / D: 누르는 동안 기울기 · 키 놓기 / Space / Esc: 정상 복귀 · 1/2/3: 약/중/강 · 카메라 OFF';
  let testIntensity = 1;
  const keys = new Set<string>();
  const directional = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
  const update = () => {
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    character.updatePosture({ state: left === right ? 'neutral' : left ? 'left' : 'right', intensity: left === right ? 0 : testIntensity });
  };
  window.addEventListener('keydown', event => {
    if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) { testIntensity = ({Digit1: .15, Digit2: .5, Digit3: 1} as Record<string, number>)[event.code]!; update(); return; }
    if (event.code === 'Space' || event.code === 'Escape') { event.preventDefault(); keys.clear(); update(); }
    else if (directional.includes(event.code)) { event.preventDefault(); keys.add(event.code); update(); }
  });
  window.addEventListener('keyup', event => {
    if (directional.includes(event.code)) { event.preventDefault(); keys.delete(event.code); update(); }
  });
  window.addEventListener('blur', () => { keys.clear(); update(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); update(); } });
} else {
  document.querySelector('.hint')!.textContent = '우클릭: 제어 메뉴 · 2초 누르기: 수면 · 더블클릭: 기상 · 기능 선택: 자세 / 힐링 / 모두 끄기';
}
void refreshDevices();
