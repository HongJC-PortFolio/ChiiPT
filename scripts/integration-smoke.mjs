import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { rm } from 'node:fs/promises';
const probe = 'dist/renderer/assets/integration-probe.js';
await build({ entryPoints: ['scripts/integration-probe.ts'], outfile: probe, bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/integration-smoke.cjs'], { env, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
  });
} finally { await rm(probe, { force: true }); }
