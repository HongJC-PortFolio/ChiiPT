import test from 'node:test';
import assert from 'node:assert/strict';
import { AppRuntime } from '../src/renderer/shared/state/AppRuntime.ts';
import { CameraManager } from '../src/renderer/shared/camera/CameraManager.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
import { StretchReminder, stretchJourney, stretchIntervalSeconds } from '../src/renderer/character/animation/StretchReminder.ts';

test('enabling from sleep waits for one wake animation before camera starts',async()=>{
  let requests=0;
  const track=Object.assign(new EventTarget(),{stop(){}});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
  const camera=new CameraManager({getUserMedia:async()=>{requests++;return stream;},enumerateDevices:async()=>[]});
  let finish!:()=>void;let count=0;
  const character=new CharacterController();const runtime=new AppRuntime(camera,character,[],async()=>{count++;await new Promise<void>(r=>{finish=r;});});
  runtime.sleep();const pending=runtime.selectMode('posture');
  assert.equal(character.state,'WakingUp');assert.equal(requests,0);
  const again=runtime.wake();assert.equal(count,1);finish();await Promise.all([pending,again]);assert.equal(character.state,'Awake');assert.equal(requests,1);
  await runtime.selectMode('off');assert.equal(character.state,'Sleep');runtime.dispose();
});
test('stretch plays once per awake hour; sleep pauses time and cancels playback',()=>{
  const timer=new StretchReminder();
  for(let i=0;i<stretchIntervalSeconds-1;i++)assert.equal(timer.update(1,true,2),null);
  for(let i=0;i<100;i++)assert.equal(timer.update(1,false,2),null);
  assert.equal(timer.update(1,true,2),0);assert.equal(timer.update(1,true,2),1);
  assert.equal(timer.update(1,true,2),null);
  for(let i=0;i<stretchIntervalSeconds-1;i++)assert.equal(timer.update(1,true,2),null);
  assert.equal(timer.update(1,true,2),0);assert.equal(timer.update(.1,false,2),null);
  assert.equal(timer.update(.1,true,2),null);
});

test('manual stretch starts immediately, does not restart on repeat, resets hourly timer',()=>{
  const timer=new StretchReminder();timer.start();
  assert.equal(timer.update(.5,true,2),.5);timer.start();
  assert.equal(timer.update(.5,true,2),1);
  assert.equal(timer.update(1,true,2),null);
  for(let i=0;i<stretchIntervalSeconds-1;i++)assert.equal(timer.update(1,true,2),null);
  assert.equal(timer.update(1,true,2),0);
});

test('stretch journey uses five-second legs and three centered cycles',()=>{
  const clip=28/18;
  assert.equal(stretchJourney(0,clip).position,0);
  assert.equal(stretchJourney(2.5,clip).position,.5);
  assert.equal(stretchJourney(0,clip).scale,1);
  assert.equal(stretchJourney(5,clip).scale,1.5);
  assert.equal(stretchJourney(10+3*clip,clip).scale,1);
  for(let i=0;i<3;i++) {
    const step=stretchJourney(5+(i+.5)*clip,clip);
    assert.equal(step.phase,'stretch');assert.equal(step.position,1);assert.equal(step.cycle,i+1);
  }
  assert.ok(Math.abs(stretchJourney(5+3*clip+2.5,clip).position-.5)<1e-9);
  assert.equal(stretchJourney(10+3*clip,clip).position,0);
});
