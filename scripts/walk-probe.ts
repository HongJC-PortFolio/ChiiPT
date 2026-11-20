import { CharacterRenderer } from '../src/renderer/character/animation/CharacterRenderer.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
export async function run(){
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const check=(v:unknown,s:string)=>{if(!v)throw new Error(s);};
 const host=document.createElement('div');host.style.cssText='position:fixed;bottom:0;left:0;width:100%;height:220px';host.dataset.mode='healing';document.body.append(host);
 const character=new CharacterController(),renderer=new CharacterRenderer(host,character);
 const internal=renderer as unknown as {ready:Promise<void>};
 const c=renderer.canvas;
 const point=(x:number,y:number)=>window.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y}));
 try{
  await internal.ready;await pause(40);
  renderer.setWalking(true);point(innerWidth/2+250,innerHeight-300);
  await pause(300);check(c.dataset.walking==='true','Walk did not start');
  check(Number(c.dataset.walkX)>innerWidth/2,'Walk did not follow pointer horizontally');
  check(Number(c.dataset.walkY)<innerHeight-15,'Walk did not follow pointer vertically');
  await pause(2200);check(c.dataset.walking==='false','Walk did not settle near pointer');
  const x=Number(c.dataset.walkX),y=Number(c.dataset.walkY);
  check(renderer.hitTest(x,y-60),'Moved character hit test missed');
  renderer.playStretch();await pause(250);
  check(c.dataset.stretchPhase==='outbound','Stretch did not interrupt walk');
  check(c.dataset.walking==='false','Walk continued during stretch');
  const begin=performance.now();while(c.dataset.stretchPhase && performance.now()-begin<17000)await pause(40);
  check(!c.dataset.stretchPhase,'Stretch did not finish');await pause(50);
  check(Math.abs(Number(c.dataset.walkX)-x)<3&&Math.abs(Number(c.dataset.walkY)-y)<3,'Stretch did not return to walk origin');
  renderer.setWalking(false);await pause(300);check(c.dataset.walking==='true','OFF did not walk home');
  for(let i=0;i<100&&c.dataset.walkX;i++)await pause(50);
  check(!c.dataset.walkX && c.style.position==='','Walk OFF did not restore bottom home');
  renderer.setWalking(true);point(100,200);await pause(200);host.dataset.mode='posture';await pause(80);
  check(!renderer.walkingEnabled&&!c.dataset.walkX,'Posture mode did not stop walk');
  renderer.setWalking(true);check(!renderer.walkingEnabled,'Posture allowed enabling walk');
  host.dataset.mode='healing';renderer.setWalking(true);point(100,200);await pause(200);character.setState('Sleep');await pause(80);
  check(!renderer.walkingEnabled&&c.dataset.sleepFrame==='5','Sleep did not stop walk');
  return {follow:true,settle:true,hitTest:true,stretchRoundTrip:true,offReturns:true,postureExclusive:true,sleepCancels:true};
 }finally{renderer.dispose();host.remove();}
}
