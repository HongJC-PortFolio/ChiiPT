const frames = (folder: string, prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `/assets/characters/${folder}/${prefix}${String(i + 1).padStart(2, '0')}.png`);

export const characterAssets = {
  pull: frames('cheek-pull', 'cheek-pull-frame-', 29),
  release: frames('cheek-release', 'cheek-release-frame-', 17),
  open: frames('idle/open', 'idle-open-frame-', 6),
  left: frames('left-run', 'walk-mirrored-frame-', 14),
  right: frames('right-run', 'walk-frame-', 14),
  stretch: frames('wake-up', 'stretch-frame-', 28),
  sleep: frames('idle/closed', 'idle-closed-frame-', 10)
};
export const characterTiming = { idleFps: 8, stretchFps: 18, sleepFps: 8 };
