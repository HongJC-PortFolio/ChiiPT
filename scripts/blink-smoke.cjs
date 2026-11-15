const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'chiipt-blink-')));
process.argv.push('--animation');
const timeout=setTimeout(()=>app.exit(1),90000);
app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{
 try{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const key=code=>win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}'}))`);
  const state=()=>win.webContents.executeJavaScript(`({...document.querySelector('canvas').dataset})`);
  const home=async()=>{for(let i=0;i<200;i++){await key('Space');await pause(75);if((await state()).atHome==='true')return;}throw new Error('No home');};
  await pause(1000);await home();
  await win.webContents.executeJavaScript(`(async()=>{const end=performance.now()+1400;while(performance.now()<end){for(const code of ['Digit3','ArrowLeft'])window.dispatchEvent(new KeyboardEvent('keydown',{code}));await new Promise(r=>setTimeout(r,20));}})()`);
  const from=Number((await state()).travelX);assert.ok(from< -30);
  await key('Space');await pause(100);let s=await state();
  assert.equal(s.runAsset,'left-run');assert.ok(Math.abs(Number(s.runAngle)-8)<.01);assert.equal(Number(s.runFps),14);assert.equal(Number(s.runVelocity),150);assert.equal(Number(s.runOpacity),1);assert.ok(Number(s.travelX)>from);
  const out=path.resolve('.local/animation');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'return-running.png'),(await win.webContents.capturePage()).toPNG());
  await home();s=await state();assert.equal(Number(s.runOpacity),0);assert.equal(Number(s.travelX),0);
  const captures=await win.webContents.executeJavaScript(`(async()=>{const frames={};const end=performance.now()+5500;while(performance.now()<end){window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));const c=document.querySelector('canvas');if(c.dataset.atHome!=='true'){await new Promise(r=>setTimeout(r,16));continue;}const i=c.dataset.idleFrame;if(!(i in frames))frames[i]=c.toDataURL();await new Promise(r=>setTimeout(r,16));}return frames;})()`);
  assert.deepEqual(Object.keys(captures).map(Number),[0,1,2,3,4,5]);
  for(const [i,data] of Object.entries(captures))fs.writeFileSync(path.join(out,`blink-${i}.png`),Buffer.from(data.split(',')[1],'base64'));
  // Keep the old right-hand fall active and verify its rendering branch is still used.
  await win.webContents.executeJavaScript(`(async()=>{const end=performance.now()+2200;while(performance.now()<end){window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight'}));await new Promise(r=>setTimeout(r,20));}})()`);
  s=await state();assert.ok(Number(s.runOpacity)>.9);assert.ok(Number(s.travelX)>0);assert.equal(s.runAsset,'right-run'); await key('Space');await pause(100);s=await state();assert.equal(s.runAsset,'right-run');assert.equal(Number(s.runVelocity),-150);assert.ok(Math.abs(Number(s.runAngle)+8)<.01);assert.equal(Number(s.runFps),14);await home();
  console.log('PASS: left run; neutral return 150px/s + 14FPS; runs until center; six blink frames; right run and leftward return');
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
}));
require('../dist/main/index.cjs');




