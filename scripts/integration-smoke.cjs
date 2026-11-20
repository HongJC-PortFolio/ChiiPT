const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'chiipt-integration-')));
process.argv.push('--animation');
const timeout=setTimeout(()=>{console.error('Integration timed out');app.exit(1);},60000);
app.on('browser-window-created',(_e,win)=>{win.on('show',()=>win.hide());return win.webContents.once('did-finish-load',async()=>{
  try {
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const {runProbe}=await import('/assets/integration-probe.js');
      return await runProbe();
    })()`);
    assert.ok(result.frames>=3);assert.equal(result.landmarks,0);assert.equal(result.hasPose,false);
    const renderer=await win.webContents.executeJavaScript(`({idle:document.querySelector('canvas')?.dataset.atHome,status:document.querySelector('#status').textContent})`);
    assert.equal(renderer.idle,'true');assert.match(renderer.status,/stopped/);
    console.log('PASS: real MediaPipe WASM/model inference on synthetic shared stream with live character renderer',result);
    clearTimeout(timeout);app.exit(0);
  }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
});});
require('../dist/main/index.cjs');
