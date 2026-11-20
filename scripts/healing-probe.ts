import { renderedCharacterRect } from '../src/renderer/features/healing/PettingOverlay.ts';
import { HandLandmarkerService } from '../src/renderer/features/healing/hand-landmarker.ts';
import { createHealingFeature } from '../src/renderer/features/healing/index.ts';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function run() {
  const pet = document.querySelector<HTMLElement>('#character')!;
  const oldMode = pet.dataset.mode;
  pet.dataset.mode = 'healing';
  const visibleCanvas = pet.querySelector('canvas')!;
  for(let i=0;i<100 && visibleCanvas.dataset.atHome !== 'true';i++) await pause(50);
  check(visibleCanvas.dataset.atHome === 'true', 'Character not at home');
  const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=240;
  const paint = () => { const c=canvas.getContext('2d')!; c.fillStyle='#ddd';c.fillRect(0,0,320,240); };
  paint(); const stream=canvas.captureStream(12), timer=setInterval(paint,80);
  const video=document.createElement('video');video.muted=true;video.srcObject=stream;document.body.append(video);
  const service=new HandLandmarkerService(new URL('/assets/mediapipe/wasm',location.href).href,new URL('/assets/models/hand_landmarker.task',location.href).href);
  const originalInit=HandLandmarkerService.prototype.initialize, originalDetect=HandLandmarkerService.prototype.detect;
  const originalRaf = window.requestAnimationFrame, originalCancel = window.cancelAnimationFrame;
  const states:string[]=[];
  const feature=createHealingFeature(result => { states.push(result.state); });
  try {
    await video.play(); await service.initialize();
    let frames=0;
    for(let i=0;i<40 && frames<3;i++) { await pause(90); const hands=service.detect(video,performance.now());if(hands) { check(hands.length===0,'Blank frame produced hands');frames++; } }
    check(frames===3,'Real model inference did not produce three results');service.close();
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 16);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
    // Exercise the real feature and reaction linkage with deterministic landmarks.
    HandLandmarkerService.prototype.initialize=async function() {};
    let sample=0, handY=.8, pinchSide: 'Left'|'Right'|null=null;
    HandLandmarkerService.prototype.detect=function() {
      if(pinchSide){
        const x=pinchSide==='Left'?.65:.35,y=.35;
        const landmarks=Array.from({length:21},()=>({x,y,z:0}));
        landmarks[4]={x:x-.01,y,z:0};landmarks[8]={x:x+.01,y,z:0};
        landmarks[5]={x:x-.1,y:y+.15,z:0};landmarks[17]={x:x+.1,y:y+.15,z:0};
        return [{score:1,handedness:pinchSide,landmarks}];
      }
      const x=.5 + Math.sin(sample++*.35)*.12;
      return [{ score:1,landmarks:Array.from({length:21},()=>({x,y:handY,z:0})) }];
    };
    pet.dataset.mode = 'healing';
    feature.start(stream);
    await pause(500);
    check(!states.includes('petting'),'Body-region strokes incorrectly triggered petting');
    const bounds=renderedCharacterRect();
    check(bounds && bounds.width<150 && bounds.height<130,'Head geometry used full canvas instead of visible art');
    handY=.2;
    const phases=new Set<string>();
    for(let i=0;i<65;i++) { await pause(80); const p=visibleCanvas.dataset.reaction;if(p)phases.add(p); }
    check(states.includes('petting'),'Gesture did not reach petting');
    check(['rub','laugh','hop'].every(p=>phases.has(p)), 'Reaction sequence missing: '+[...phases]);
    handY=.8; await pause(150);
    check(states.at(-1)==='hand-detected','Leaving head did not cancel petting');
    await pause(1300);
    check(!visibleCanvas.dataset.reaction,'Reaction survived leaving head grace period');
    for(const side of ['Left','Right'] as const){
      pinchSide=side;
      await pause(250);
      check(states.at(-1)==='pinching',side+' cheek did not recognize pinch');
      check(visibleCanvas.dataset.pinchFrame?.startsWith('pull:'),'Pull frames did not render');
      check(!visibleCanvas.dataset.reaction,'Petting overlaps pinch');
      await pause(1700);
      check(visibleCanvas.dataset.pinchFrame==='pull:29','Held pinch did not hold final pull frame');
      pinchSide=null;handY=.8;await pause(150);
      check(visibleCanvas.dataset.pinchFrame?.startsWith('release:'),'Release frames did not render');
      await pause(1100);
      check(!visibleCanvas.dataset.pinchFrame,'Release did not return to idle');
    }
    pinchSide='Right';await pause(250);
    feature.stop(); await pause(100);
    check(!visibleCanvas.dataset.pinchFrame,'Pinch survived camera stop');
    pinchSide=null;
    check(!visibleCanvas.dataset.reaction,'Motion survived stop');
    check(stream.getVideoTracks()[0]!.readyState==='live','Shared camera track was stopped');
    pet.dataset.mode = 'healing';
    handY=.2;
    feature.start(stream); await pause(500);
    check(states.at(-1)==='petting','Restart did not restore head interaction');
    pet.dataset.mode='posture'; await pause(100);
    check(Array.from(document.querySelectorAll<HTMLElement>('#hand-cursor')).every(el=>getComputedStyle(el).display==='none'),'Hand cursor survived posture mode');
    check(states.at(-1)==='idle','Mode change did not reset gesture');
    feature.stop();
    return {frames, phases:[...phases], states, sharedStreamPreserved:true,pinchBothSides:true,pullHoldAndRelease:true};
  } finally {
    feature.dispose?.(); service.close();
    window.requestAnimationFrame = originalRaf; window.cancelAnimationFrame = originalCancel;
    pet.dataset.mode = oldMode;
    HandLandmarkerService.prototype.initialize=originalInit;HandLandmarkerService.prototype.detect=originalDetect;
    clearInterval(timer); video.pause();video.srcObject=null;video.remove();stream.getTracks().forEach(t=>t.stop());
  }
}
