const {app}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'chiipt-healing-')));
process.argv.push('--animation');
const timeout=setTimeout(()=>{console.error('Stretch integration timeout');app.exit(1);},60000);
app.on('browser-window-created',(_event,win)=>{
  win.on('show',()=>win.hide());
  win.webContents.on('console-message',(_e,...args)=>console.log('[renderer]',...args));
  win.webContents.once('did-finish-load',async()=>{
    try {
      const result=await win.webContents.executeJavaScript(`import('/assets/stretch-probe.js').then(m=>m.run())`);
      console.log('PASS: sleep/stretch integration',result);clearTimeout(timeout);app.exit(0);
    }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
  });
});
require('../dist/main/index.cjs');
