import { CharacterRenderer } from '../src/renderer/character/animation/CharacterRenderer.ts';
import { CharacterController } from '../src/renderer/character/CharacterController.ts';
export async function run() {
  const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  const check=(v:unknown,message:string)=>{if(!v)throw new Error(message);};
  const host=document.createElement('div');host.style.cssText='position:fixed;bottom:0;left:0;width:100%;height:220px';document.body.append(host);
  const controller=new CharacterController();const renderer=new CharacterRenderer(host,controller);
  const internals=renderer as unknown as {ready:Promise<void>;stretch:{elapsed:number}};
  try {
    await internals.ready;controller.setState('Sleep');await pause(150);
    check(Number(renderer.canvas.dataset.poseOpacity)>.3&&Number(renderer.canvas.dataset.poseOpacity)<1,'Sleep must fade gradually');
    await pause(2000);
    const canvas=renderer.canvas,ctx=canvas.getContext('2d')!;
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let maxAlpha=0;for(let i=3;i<pixels.length;i+=4)maxAlpha=Math.max(maxAlpha,pixels[i]!);
    check(maxAlpha>=75&&maxAlpha<=77,'Sleep opacity must be 30%');
    const still=canvas.toDataURL();await pause(300);check(canvas.toDataURL()!==still,'Sleep must breathe');
    check(canvas.dataset.sleepFrame==='5','Sleep must use fully closed eyes');
    check(canvas.dataset.sleepFrame,'Closed sleep did not render');
    controller.setState('WakingUp');
    const waking=renderer.playWake(new AbortController().signal);
    await pause(30);
    check(!!canvas.dataset.wakeFrame,'Wake must immediately play stretch');
    const wakeFrames=new Set<number>();
    for(let i=0;i<320;i++){await pause(10);if(canvas.dataset.wakeFrame)wakeFrames.add(Number(canvas.dataset.wakeFrame));}
    await waking;check(wakeFrames.size>=24,'Wake frames missing');check(canvas.style.position==='','Wake must stay at bottom');
    controller.setState('Awake');await pause(100);
    check(!canvas.dataset.stretchFrame,'ON must not play stretch');
    renderer.playStretch();
    const frames=new Set<number>(),cycles=new Set<number>(),phases=new Set<string>();let centered=false;const start=performance.now();
    for(let i=0;i<1900;i++) {
      await pause(10);
      if(canvas.dataset.stretchPhase)phases.add(canvas.dataset.stretchPhase);
      if(canvas.dataset.stretchFrame) {
        cycles.add(Number(canvas.dataset.stretchCycle));
        frames.add(Number(canvas.dataset.stretchFrame));
        const rect=canvas.getBoundingClientRect();
        const scale=Number(canvas.dataset.stretchScale||1);
        const visualCenter=205-120*scale/2;
        centered ||= Math.abs(rect.top+visualCenter-innerHeight/2)<2;
      }
      if(phases.size&& !canvas.dataset.stretchPhase)break;
    }
    check(phases.size===3,'All three phases required');check(cycles.size===3,'Three stretch repeats required');
    check(performance.now()-start>=14500,'Journey must include two five-second walks');
    check(frames.size>=24,'Stretch frames missing');check(centered,'Stretch not centered vertically');
    check(!canvas.dataset.stretchFrame&&canvas.style.position==='','Stretch must return to bottom');
    renderer.playStretch();await pause(100);controller.setState('Sleep');await pause(100);
    check(!canvas.dataset.stretchFrame&&!!canvas.dataset.sleepFrame,'Sleep must cancel stretch');
    return {maxAlpha,frames:[...frames],phases:[...phases],cycles:[...cycles],centered,returned:true,cancelled:true};
  } finally {renderer.dispose();host.remove();}
}
