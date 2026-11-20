import test from 'node:test';
import assert from 'node:assert/strict';
import { FowardHeadPosture } from '../src/renderer/features/posture/forwardHeadPosture.ts';
import { ShoulderPosture } from '../src/renderer/features/posture/ShoulderPosture.ts';
import type { PoseFrame } from '../src/renderer/features/posture/detector.ts';
function frame(t:number,width=.3,angle=0):PoseFrame {
  const r=angle*Math.PI/180;
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}));
  landmarks[11]!.x=.5-width*Math.cos(r)/2;landmarks[12]!.x=.5+width*Math.cos(r)/2;
  landmarks[11]!.y=.5-width*Math.sin(r)*640/480/2;landmarks[12]!.y=.5+width*Math.sin(r)*640/480/2;
  return {timestampMs:t,imageWidth:640,imageHeight:480,hasPose:true,hasUpperBody:true,landmarks,worldLandmarks:[]};
}
test('distance calibrates, approaches and recedes while shoulder tilt remains independent',()=>{
  const distance=new FowardHeadPosture(),shoulders=new ShoulderPosture();let t=0;
  for(let i=0;i<12;i++)assert.equal(distance.update(frame(t+=80)),1);
  for(let i=0;i<30;i++){const f=frame(t+=80,.42,8);distance.update(f);shoulders.update(f);}
  assert.ok(Math.abs(distance.scale-1.4)<.001);assert.ok(Math.abs(shoulders.angleDegrees-8)<.001);
  for(let i=0;i<30;i++)distance.update(frame(t+=80));
  assert.ok(Math.abs(distance.scale-1)<.001);
});
test('distance honors cap and clears stale scale and calibration after missing landmarks',()=>{
  const d=new FowardHeadPosture({maxScale:1.3});let t=0;
  for(let i=0;i<12;i++)d.update(frame(t+=80));
  for(let i=0;i<40;i++)d.update(frame(t+=80,.6));
  assert.ok(d.scale<=1.3&&d.scale>1.29);
  const invalid=frame(t+200);invalid.landmarks=[];
  assert.equal(d.update(invalid),d.scale);
  invalid.timestampMs=t+1100;assert.equal(d.update(invalid),1);
  for(let i=0;i<12;i++)assert.equal(d.update(frame(t+=120,.6)),1);
  d.reset();assert.equal(d.scale,1);
});
