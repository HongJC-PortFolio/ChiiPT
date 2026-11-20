import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';

await mkdir('dist/renderer', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ entryPoints: ['src/renderer/index.ts'], outfile: 'dist/renderer/index.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022' }),
  copyFile('src/renderer/index.html', 'dist/renderer/index.html'),
  copyFile('src/renderer/styles.css', 'dist/renderer/styles.css'),
  // The hand model is fetched by MediaPipe at runtime, rather than bundled.
  cp('src/assets', 'dist/renderer/assets', { recursive: true })
]);

// Copy after the app assets so the destination parent exists on a clean build.
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'dist/renderer/assets/mediapipe/wasm', { recursive: true });
