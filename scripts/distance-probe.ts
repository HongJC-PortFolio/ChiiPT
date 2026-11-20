import { CharacterRenderer } from '../src/renderer/character/animation/CharacterRenderer.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
import { createPostureFeature } from '../src/renderer/features/posture/index.ts';
import { Detector, type PoseFrame } from '../src/renderer/features/posture/detector.ts';
export async function run(){
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const check=(v:unknown,s:string)=>{if(!v)throw new Error(s);};
 const host=document.createElement('div');host.style.cssText='position:fixed;bottom:0;left:0;width:100%;height:220px';host.dataset.mode='posture';document.body.append(host);
 const controller=new CharacterController(),renderer=new CharacterRenderer(host,controller);
 const internal=renderer as unknown as {ready:Promise<void>;run:{x:number}};
 const original=Detector.prototype.start;
 let result!:(f:PoseFrame)=>void;
 Detector.prototype.start=function(){result=(this as unknown as {options:{onResults:(f:PoseFrame)=>void}}).options.onResults;};
 const feature=createPostureFeature(p=>controller.updatePosture(p),s=>renderer.setScale(host.dataset.mode==='posture'?s:1));
 let timestamp=0;
 const feed=(width:number)=>{
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}));
  landmarks[11]!.x=.5-width/2;landmarks[12]!.x=.5+width/2;
  result({timestampMs:timestamp+=80,imageWidth:640,imageHeight:480,hasPose:true,hasUpperBody:true,landmarks,worldLandmarks:[]});
 };
 const bounds=()=>{
  const c=renderer.canvas,ctx=c.getContext('2d')!,data=ctx.getImageData(0,0,c.width,c.height).data;
  let minX=c.width,minY=c.height,maxX=0,maxY=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]!>50){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const rect=c.getBoundingClientRect(),ratio=c.height/rect.height;
  check(minX>0&&maxX<c.width-1,'Horizontal clipping');check(minY>0,'Top clipped by canvas');
  check(rect.top+minY/ratio>=-1,'Top clipped by screen');
  check(Math.abs(maxY/ratio-Number(c.dataset.floor))<3,'Feet not grounded');
 };
 try{
  await internal.ready;feature.start({} as MediaStream);
  for(let i=0;i<12;i++)feed(.3);await pause(80);
  check(renderer.canvas.style.height==='220px','Normal canvas must stay small');
  for(let i=0;i<25;i++)feed(.45);await pause(750);
  check(Number(renderer.canvas.dataset.characterScale)>1.9&&Number(renderer.canvas.dataset.characterScale)<=2,'Distance must approach 2x maximum');
  for(let i=0;i<20;i++){renderer.setScale(i%2?1.08:1.8);await pause(100);}
  check(Number(renderer.canvas.dataset.characterScale)===2,'Sustained close posture must hold fixed 2x regardless of distance');
  renderer.setScale(1.03);await pause(200);check(Number(renderer.canvas.dataset.characterScale)===2,'Hysteresis must preserve maximum');
  renderer.setScale(1);await pause(1400);check(Number(renderer.canvas.dataset.characterScale)===1,'Neutral distance must restore normal size');
  renderer.setScale(1.5);await pause(750);
  check(renderer.canvas.dataset.distanceExpanded==='true','Canvas did not expand');bounds();
  for(const state of ['left','right'] as const){
   renderer.setScale(1.6);internal.run.x=state==='left'?-2000:2000;controller.updatePosture({state,intensity:1});await pause(200);bounds();
  }
  host.style.width='500px';renderer.setScale(2);await pause(200);bounds();
  host.dataset.mode='healing';await pause(80);
  check(Number(renderer.canvas.dataset.characterScale)===1&&renderer.canvas.style.height==='220px','Healing inherited distance scale');
  host.style.width='100%';host.dataset.mode='posture';renderer.setScale(1.5);await pause(500);feature.stop();await pause(1800);
  check(renderer.canvas.dataset.distanceExpanded==='false','Stop left expanded canvas');
  renderer.setScale(1.5);await pause(500);controller.setState('Sleep');await pause(80);
  check(renderer.canvas.style.height==='220px','Sleep inherited enlarged canvas');
  controller.setState('Awake');renderer.setScale(1.5);await pause(500);await pause(2600);
  check(renderer.canvas.dataset.distanceExpanded==='false','Stale distance did not reset');
  return {distanceConnected:true,localSprites:true,bounds:true,healingIndependent:true,stopAndSleepReset:true,staleReset:true};
 }finally{feature.stop();Detector.prototype.start=original;renderer.dispose();host.remove();}
}
