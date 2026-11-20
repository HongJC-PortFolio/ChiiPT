import test from 'node:test';
import assert from 'node:assert/strict';
import { AppRuntime } from '../src/renderer/shared/state/AppRuntime.ts';
import { CameraManager } from '../src/renderer/shared/camera/CameraManager.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
import type { FeatureModule } from '../src/renderer/shared/types/index.ts';

function fixture(pending?: Promise<MediaStream>) {
  let stopped=0, requests=0;
  const track=Object.assign(new EventTarget(), {stop(){stopped++;}});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]} as unknown as MediaStream;
  const active=new Set<string>();
  const character=new CharacterController();
  const feature=(id:FeatureModule['id']):FeatureModule=>({id,start(s){assert.equal(s,stream);active.add(id);assert.equal(active.size,1);},stop(){active.delete(id);}});
  const camera=new CameraManager({getUserMedia:async()=>{requests++;return pending??stream;},enumerateDevices:async()=>[]});
  const runtime=new AppRuntime(camera,character,[feature('posture'),feature('healing')]);
  return {runtime,camera,character,active,stream,requests:()=>requests,stopped:()=>stopped};
}
test('mode switches reuse a single stream, stop old feature, clear results and off releases camera',async()=>{
  const f=fixture();
  await f.runtime.selectMode('posture');assert.deepEqual([...f.active],['posture']);
  f.character.updatePosture({state:'left',intensity:1});
  await f.runtime.selectMode('healing');assert.deepEqual([...f.active],['healing']);
  assert.equal(f.character.posture.state,'neutral');assert.equal(f.requests(),1);assert.equal(f.stopped(),0);
  f.character.updateHealing({state:'petting'});
  await f.runtime.selectMode('posture');assert.deepEqual([...f.active],['posture']);assert.equal(f.character.healing.state,'idle');
  await f.runtime.selectMode('off');assert.equal(f.active.size,0);assert.equal(f.stopped(),1);
  await f.runtime.startCamera();assert.equal(f.requests(),1);f.runtime.dispose();
});
test('rapid selections during camera permission activate only the final mode',async()=>{
  let resolve!:(s:MediaStream)=>void;
  const f=fixture(new Promise<MediaStream>(done=>{resolve=done;}));
  const a=f.runtime.selectMode('posture');const b=f.runtime.selectMode('healing');
  resolve(f.stream);await Promise.all([a,b]);assert.deepEqual([...f.active],['healing']);
  assert.equal(f.requests(),1);f.runtime.dispose();
});
test('off during permission cancels late stream and never starts features',async()=>{
  let resolve!:(s:MediaStream)=>void;
  const f=fixture(new Promise<MediaStream>(done=>{resolve=done;}));
  const a=f.runtime.selectMode('healing');await Promise.resolve();
  await f.runtime.selectMode('off');resolve(f.stream);await a;
  assert.equal(f.active.size,0);assert.equal(f.stopped(),1);f.runtime.dispose();
});
test('sleep stops selected mode and wake restores only that mode',async()=>{
  const f=fixture();await f.runtime.selectMode('healing');f.runtime.sleep();
  assert.equal(f.active.size,0);await f.runtime.wake();assert.deepEqual([...f.active],['healing']);
  f.runtime.sleep();await f.runtime.selectMode('posture');assert.equal(f.character.state,'Awake');
  assert.deepEqual([...f.active],['posture']);f.runtime.dispose();
});
