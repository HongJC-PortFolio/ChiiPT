import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';
import electron from 'electron';
await build({entryPoints:['scripts/stretch-probe.ts'],outfile:'dist/renderer/assets/stretch-probe.js',bundle:true,platform:'browser',format:'esm',target:'es2022'});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try {
  process.exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(electron,['scripts/wake-smoke.cjs'],{stdio:'inherit',env});child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
}finally {await rm('dist/renderer/assets/stretch-probe.js',{force:true});}
