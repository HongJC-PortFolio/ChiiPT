import { WalkController } from '../../features/healing/walk/WalkController.ts';
import { StretchReminder, stretchMotion, stretchJourney } from './StretchReminder.ts';
import { LeftRunSequence, leftRunSettings } from './LeftRunSequence.ts';
import { characterAssets, characterTiming } from './CharacterAssets.ts';
import type { CharacterController } from '../CharacterController.ts';

const height = 220, characterHeight = 120, floor = 205;
const stretchHeight = 330;
export const distanceRenderingSettings = { enterRatio: 1.05, exitRatio: 1.02, maxScale: 2, expandedHeight: 1200, smoothingSeconds: .18 };
type Point = { x: number; y: number };
type Sprite = { image: HTMLImageElement; contour: Point[] };
type Clip = { sprites: Sprite[]; centerX: number; bottom: number; scale: number };

export class CharacterRenderer {
  readonly canvas = document.createElement('canvas');
  private pinch: 'pull'|'release'|null = null;
  private pinchTime = 0;
  private pinchMirror = false;
  private onPinch = (event: Event): void => {
    const command=(event as CustomEvent<{on?:boolean;mirrored?:boolean;cancel?:boolean}>).detail;
    if(command.cancel){this.pinch=null;delete this.canvas.dataset.pinchFrame;return;}
    if(command.on){this.pinch='pull';this.pinchMirror=!!command.mirrored;}
    else if(this.pinch==='pull')this.pinch='release';
    this.pinchTime=0;
  };
  private paintPinch(x:number,dt:number):boolean {
    if(!this.pinch)return false;
    this.pinchTime+=dt;
    const clip=this.clips[this.pinch],index=Math.floor(this.pinchTime/.055);
    if(this.pinch==='release'&&index>=clip.sprites.length){this.pinch=null;delete this.canvas.dataset.pinchFrame;return false;}
    this.canvas.dataset.pinchFrame=`${this.pinch}:${Math.min(index,clip.sprites.length-1)+1}`;
    // Preserve the idle interaction box while the cheek stretches.
    const bounds=this.canvas.dataset.artBounds;
    this.context.save();
    if(this.pinchMirror){this.context.translate(2*x,0);this.context.scale(-1,1);}
    this.paint(clip,Math.min(index,clip.sprites.length-1),x);
    this.context.restore();
    if(bounds)this.canvas.dataset.artBounds=bounds;
    return true;
  }
  private context: CanvasRenderingContext2D;
  private clips!: Record<keyof typeof characterAssets, Clip>;
  private ready: Promise<void>;
  private run = new LeftRunSequence();
  private frame = 0;
  private last = 0;
  private disposed = false;
  private useRightMotion = false;
  private idleTime = 0;
  private previousState = '';
  private stretch = new StretchReminder();
  private stretchOrigin: number | null = null;
  private stretchOriginTop = 0;
  private walk = new WalkController();
  private walkRequested = false;
  private walkInitialized = false;
  private walkPhase = 0;
  private onWalkPointer = (event:PointerEvent):void => {
    if(this.walkRequested)this.walk.target={x:event.clientX,y:event.clientY};
  };
  get walkingEnabled():boolean {return this.walkRequested;}
  setWalking(on:boolean):void {
    this.walkRequested=on&&this.controller.state==='Awake'&&this.canvas.parentElement?.dataset.mode==='healing';
  }
  private sleepTime = 0;
  private eyeOpen = 1;
  private wakeTime = 0;
  private wakeDone: (()=>void) | null = null;
  private wakeSignal: AbortSignal | null = null;
  private distanceRatio = 1;
  private distanceUpdated = -Infinity;
  private approaching = false;
  private characterScale = 1;
  private renderFloor = floor;
  private controller: CharacterController;

  constructor(host: HTMLElement, controller: CharacterController) {
    this.controller = controller;
    this.canvas.width = innerWidth * Math.min(devicePixelRatio, 2);
    this.canvas.height = height * Math.min(devicePixelRatio, 2);
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.floor = String(floor);
    this.canvas.dataset.characterHeight = String(characterHeight);
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })!;
    host.replaceChildren(this.canvas);
    this.canvas.addEventListener('cheek-pinch',this.onPinch);
    window.addEventListener('pointermove',this.onWalkPointer);
    this.ready = (async () => {
      const entries = await Promise.all(Object.entries(characterAssets).map(async ([key, paths]) =>
        [key, await this.loadClip(paths, key === 'sleep')] as const));
      this.clips = Object.fromEntries(entries) as typeof this.clips;
      // Idle/open and stretch share a source canvas and foot anchor.
      // Use the open pose's scale for all three, preserving the stretch itself.
      for (const key of ['sleep', 'stretch', 'pull', 'release'] as const) {
        this.clips[key].scale = this.clips.open.scale;
        this.clips[key].centerX = this.clips.open.centerX;
        this.clips[key].bottom = this.clips.open.bottom;
      }
      if (!this.disposed) this.frame = window.setInterval(() => this.draw(performance.now()), 1000 / 60);
    })();
    void this.ready.catch(error => { if (!this.disposed) host.textContent = `캐릭터 이미지 로드 실패: ${String(error)}`; });
  }

  private async loadClip(paths: string[], sleeping: boolean): Promise<Clip> {
    const images = await Promise.all(paths.map(async path => {
      const image = new Image(); image.src = new URL(path, location.href).href; await image.decode(); return image;
    }));
    let minX=Infinity, maxX=0, minY=Infinity, maxY=0;
    const sprites = images.map(image => {
      const scratch = document.createElement('canvas'); scratch.width=image.naturalWidth; scratch.height=image.naturalHeight;
      const ctx=scratch.getContext('2d', { willReadFrequently: true })!;ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data;
      const contour:Point[]=[];
      for(let y=0;y<scratch.height;y++) {
        let first=-1,last=-1;
        for(let x=0;x<scratch.width;x++) if(pixels[(y*scratch.width+x)*4+3]!>50) {
          if(first<0)first=x;last=x;
        }
        if(first>=0) {
          contour.push({x:first,y:y+1},{x:last+1,y:y+1});
          minX=Math.min(minX,first);maxX=Math.max(maxX,last+1);minY=Math.min(minY,y);maxY=Math.max(maxY,y+1);
        }
      }
      return {image,contour};
    });
    if(!Number.isFinite(minX))throw new Error(`빈 캐릭터 이미지: ${paths[0]}`);
    const scale = sleeping ? Math.min(characterHeight / 150, (floor - 8) / (maxY - minY)) : characterHeight / (maxY - minY);
    return {sprites, centerX:(minX+maxX)/2, bottom:maxY, scale};
  }

  /** Receives the teammate's shoulder-width ratio, independently of sideways posture. */
  setScale(ratio:number):void {
    if(!Number.isFinite(ratio)||ratio<=0)return;
    this.distanceRatio=ratio;this.distanceUpdated=performance.now();
  }

  async playWake(signal: AbortSignal): Promise<void> {
    await this.ready;if(signal.aborted||this.disposed)return;
    this.finishWake();this.eyeOpen=1;this.wakeTime=0;this.wakeSignal=signal;
    await new Promise<void>(resolve=>{this.wakeDone=resolve;signal.addEventListener('abort',this.finishWake,{once:true});});
  }
  private finishWake=():void=>{
    this.wakeSignal?.removeEventListener('abort',this.finishWake);this.wakeSignal=null;
    const done=this.wakeDone;this.wakeDone=null;delete this.canvas.dataset.wakeFrame;done?.();
  };
  playStretch(): void {
    if (this.controller.state === 'Awake') this.stretch.start();
  }

  private paintEyes(x:number,open:number,breath=0):void {
    const ctx=this.context,alpha=.3+.7*open;
    // Compensate source-over blending to preserve the intended overall opacity.
    const closedAlpha=alpha*(1-open);
    ctx.save();ctx.translate(x,this.renderFloor);ctx.scale(1-breath*.008,1+breath*.015);ctx.translate(-x,-this.renderFloor);
    if(open>0)this.paint(this.clips.open,0,x,0,alpha*open/(1-closedAlpha));
    if(open<1)this.paint(this.clips.sleep,4,x,0,closedAlpha);
    ctx.restore();
    this.canvas.dataset.eyeOpen=String(open);this.canvas.dataset.poseOpacity=String(alpha);
  }

  private paint(clip:Clip,index:number,x:number,rotation=0,alpha=1,grounded=false,effort=0,effortTime=0,scale=1):void {
    const sprite=clip.sprites[index]!;const ctx=this.context;
    let support=0;
    if(grounded || scale>1) {
      const cos=Math.cos(rotation),sin=Math.sin(rotation);
      let minX=Infinity,maxX=-Infinity;support=-Infinity;
      for(const p of sprite.contour) {
        const px=(p.x-clip.centerX)*clip.scale,py=(p.y-clip.bottom)*clip.scale;
        const projectedX=(px*cos-py*sin)*scale;
        minX=Math.min(minX,projectedX);maxX=Math.max(maxX,projectedX);support=Math.max(support,px*sin+py*cos);
      }
      const width=this.canvas.parentElement!.clientWidth;
      x=Math.max(4-minX,Math.min(width-4-maxX,x));
    }
    // Publish visible art bounds, never the full-width transparent canvas.
    if(this.canvas.parentElement?.dataset.mode==='healing') {
      const cos=Math.cos(rotation),sin=Math.sin(rotation);
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
      for(const p of sprite.contour) {
        const px=(p.x-clip.centerX)*clip.scale,py=(p.y-clip.bottom)*clip.scale;
        const sx=x+(px*cos-py*sin)*scale,sy=this.renderFloor-support*scale+(px*sin+py*cos)*scale;
        left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);
      }
      this.canvas.dataset.artBounds=[left,top,right-left,bottom-top].join(',');
    }
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,this.renderFloor-support*scale);ctx.rotate(rotation);ctx.scale(scale,scale);
    ctx.drawImage(sprite.image,-clip.centerX*clip.scale,-clip.bottom*clip.scale,sprite.image.naturalWidth*clip.scale,sprite.image.naturalHeight*clip.scale);
    // Draw sweat with the sprite transform, so it follows either running direction.
    if(effort>0) {
      const hard=Math.max(0,effort-1);
      for(let i=0;i<5;i++) {
        const strength=i<2?Math.min(1,effort):hard;
        if(strength<=0)continue;
        const phase=(effortTime*(.9+hard*.7)+i*.23)%1;
        const side=i%2===0?-1:1;
        const x=side*(34+phase*(6+hard*8));
        const y=-90+phase*22-(i%3)*7;
        const size=2.2+hard*1.4;
        ctx.globalAlpha=alpha*strength*Math.sin(phase*Math.PI)*.9;
        ctx.fillStyle='#79cde8';ctx.strokeStyle='#438daa';ctx.lineWidth=.7;
        ctx.beginPath();ctx.moveTo(x,y-size*2);
        ctx.bezierCurveTo(x-size*1.5,y,x-size,y+size,x,y+size);
        ctx.bezierCurveTo(x+size,y+size,x+size*1.5,y,x,y-size*2);
        ctx.fill();ctx.stroke();
      }
    }
    ctx.restore();
  }

  private draw = (now:number):void => {
    const dt=this.last?Math.max(0,(now-this.last)/1000):0;this.last=now;
    // Measure the untransformed host: healing animations must not resize the backing canvas.
    const width=this.canvas.parentElement!.clientWidth;if(!width)return;
    const ratio=Math.min(devicePixelRatio,2);
    const home=width/2,state=this.controller.state;
    if(state!==this.previousState) {
      if(state==='Sleep') {this.run=new LeftRunSequence();this.sleepTime=0;}
      this.previousState=state;
    }
    this.canvas.dataset.visualState=state;
    const sleeping=state==='Sleep'||state==='FallingAsleep';
    const step=Math.min(dt,.1)/(sleeping?2:1);
    this.eyeOpen=sleeping?Math.max(0,this.eyeOpen-step):Math.min(1,this.eyeOpen+step);
    const open=this.eyeOpen*this.eyeOpen*(3-2*this.eyeOpen);
    const clipSeconds=this.clips.stretch.sprites.length/characterTiming.stretchFps;
    const stretchTime=this.stretch.update(dt,state==='Awake',2*stretchMotion.travelSeconds+clipSeconds*stretchMotion.repeats);
    const stretching=stretchTime!==null;
    const healing=state==='Awake'&&this.canvas.parentElement!.dataset.mode==='healing';
    const walkHome={x:home,y:innerHeight-15};
    if(!this.walkInitialized||!healing){
      this.walk.x=walkHome.x;this.walk.y=walkHome.y;this.walk.moving=false;this.walk.target=null;
      if(!healing)this.walkRequested=false;
      this.walkInitialized=true;
    }
    this.walk.home=walkHome;
    if(healing&&!stretching&&this.run.x===0){
      this.walk.enabled=this.walkRequested;this.walk.update(Math.min(dt,.1),{w:width,h:innerHeight});
    }
    const walking=healing&&(this.walkRequested||Math.hypot(this.walk.x-home,this.walk.y-walkHome.y)>.5)&&this.run.x===0;
    this.canvas.dataset.walking=String(walking&&this.walk.moving&&!stretching);
    if(!healing||stretching||this.walk.moving){this.pinch=null;delete this.canvas.dataset.pinchFrame;}
    this.canvas.dataset.renderX=String(home);
    const distanceEnabled=state==='Awake'&&!stretching&&this.canvas.parentElement!.dataset.mode==='posture';
    const recent=now-this.distanceUpdated<1200;
    const distanceRatio=recent?this.distanceRatio:1;
    if(!distanceEnabled){this.approaching=false;this.characterScale=1;}
    else {
      if(distanceRatio>=distanceRenderingSettings.enterRatio)this.approaching=true;
      else if(distanceRatio<=distanceRenderingSettings.exitRatio)this.approaching=false;
      const target=this.approaching?distanceRenderingSettings.maxScale:1;
      this.characterScale+=(target-this.characterScale)*(1-Math.exp(-Math.min(dt,.1)/distanceRenderingSettings.smoothingSeconds));
      if(Math.abs(this.characterScale-target)<.002)this.characterScale=target;
    }
    // Account for rotation as well as sprite height on smaller displays.
    const displayScale=Math.min(this.characterScale,Math.max(1,(innerHeight-35)/(characterHeight*1.5)),Math.max(1,(width-16)/(characterHeight*1.5)));
    const expanded=distanceEnabled&&displayScale>1.002;
    const effectiveHeight=stretching?stretchHeight:expanded?Math.max(height,Math.min(distanceRenderingSettings.expandedHeight,innerHeight)):height;
    this.renderFloor=stretching?floor:effectiveHeight-15;
    this.canvas.parentElement!.style.height=`${stretching?height:effectiveHeight}px`;
    this.canvas.dataset.floor=String(this.renderFloor);
    this.canvas.dataset.characterHeight=String(characterHeight*displayScale);
    this.canvas.dataset.characterScale=String(displayScale);
    this.canvas.dataset.distanceRatio=String(distanceRatio);
    this.canvas.dataset.distanceExpanded=String(expanded);
    if(this.canvas.width!==Math.round(width*ratio)||this.canvas.height!==Math.round(effectiveHeight*ratio)) {
      this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(effectiveHeight*ratio);
    }
    const ctx=this.context;ctx.setTransform(this.canvas.width/width,0,0,this.canvas.height/effectiveHeight,0,0);ctx.clearRect(0,0,width,effectiveHeight);
    this.canvas.style.position=stretching?'fixed':'';
    this.canvas.style.height=`${effectiveHeight}px`;
    if(!stretching) {this.canvas.style.top='';delete this.canvas.dataset.stretchScale;}
    this.canvas.style.left=stretching?'0':'';
    if(!stretching) {this.stretchOrigin=null;delete this.canvas.dataset.stretchPhase;delete this.canvas.dataset.stretchCycle;}
    if(state==='Sleep'||state==='FallingAsleep') {
      const index=4; // Fully closed eyes; keep this pose still.
      this.sleepTime+=Math.min(dt,1);
      const breath=Math.sin(this.sleepTime*2*Math.PI/4)*(1-open);
      this.paintEyes(home,open,breath);
      this.canvas.dataset.sleepFrame=String(index+1);this.canvas.dataset.atHome='false';
      delete this.canvas.dataset.stretchFrame;return;
    }
    if(!stretching) {this.stretchOrigin=null;delete this.canvas.dataset.stretchPhase;delete this.canvas.dataset.stretchCycle;}
    delete this.canvas.dataset.sleepFrame;
    if(state==='WakingUp') {
      this.canvas.dataset.atHome='false';

      const index=Math.min(this.clips.stretch.sprites.length-1,Math.floor(this.wakeTime*characterTiming.stretchFps));
      this.paint(this.clips.stretch,index,home);this.canvas.dataset.wakeFrame=String(index+1);
      this.canvas.dataset.atHome='false';
      if(this.wakeDone){this.wakeTime+=dt;if(this.wakeTime>=clipSeconds&&index===this.clips.stretch.sprites.length-1)this.finishWake();}
      return;
    }
    if(stretching) {
      if(this.stretchOrigin===null){
        this.stretchOrigin=walking?this.walk.x-home:this.run.x;
        this.stretchOriginTop=walking?this.walk.y-floor:this.canvas.parentElement!.getBoundingClientRect().top;
      }
      const journey=stretchJourney(stretchTime,clipSeconds);
      const origin=Math.max(-Math.max(0,home-86),Math.min(Math.max(0,home-86),this.stretchOrigin));
      const x=home+origin*(1-journey.position);
      const bottomTop=this.stretchOriginTop;
      const visualCenter=floor-characterHeight*journey.scale/2;
      const centerTop=innerHeight/2-visualCenter;
      this.canvas.style.top=`${bottomTop+(centerTop-bottomTop)*journey.position}px`;
      this.canvas.dataset.atHome='false';
      this.canvas.dataset.stretchPhase=journey.phase;
      this.canvas.dataset.stretchCycle=String(journey.cycle);
      if(journey.phase==='stretch') {
        const index=Math.min(this.clips.stretch.sprites.length-1,Math.floor(journey.clipTime*characterTiming.stretchFps));
        this.paint(this.clips.stretch,index,x,0,1,false,0,0,journey.scale);
        this.canvas.dataset.stretchFrame=String(index+1);
      } else {
        const right=journey.phase==='outbound'?origin<=0:origin>0;
        const clip=right?this.clips.right:this.clips.left;
        const index=Math.floor(stretchTime*stretchMotion.walkFps)%clip.sprites.length;
        this.paint(clip,index,x,0,1,true,0,0,journey.scale);
        delete this.canvas.dataset.stretchFrame;
      }
      this.canvas.dataset.stretchX=String(x);this.canvas.dataset.stretchScale=String(journey.scale);return;
    }
    delete this.canvas.dataset.stretchFrame;
    if(walking){
      this.canvas.style.position='fixed';this.canvas.style.left='0';this.canvas.style.top=`${this.walk.y-floor}px`;
      this.canvas.dataset.renderX=String(this.walk.x);
      this.canvas.dataset.walkX=String(this.walk.x);this.canvas.dataset.walkY=String(this.walk.y);
      this.canvas.dataset.atHome=String(!this.walk.moving);
      this.canvas.style.transformOrigin=`${this.walk.x}px ${floor}px`;
      if(!this.walk.moving && this.paintPinch(this.walk.x,dt))return;
      if(this.walk.moving){
        this.walkPhase=(this.walkPhase+dt*16)%this.clips.left.sprites.length;
        // Posture sprites lean opposite travel; walking must face toward the cursor.
        const clip=this.walk.facing==='right'?this.clips.left:this.clips.right;
        this.paint(clip,Math.floor(this.walkPhase),this.walk.x,0,1,true);
      }else this.paint(this.clips.open,Math.floor(now/1000*characterTiming.idleFps)%this.clips.open.sprites.length,this.walk.x);
      return;
    }
    delete this.canvas.dataset.walkX;delete this.canvas.dataset.walkY;
    this.canvas.style.transformOrigin=`50% ${this.renderFloor}px`;
    if(healing && this.run.x===0 && this.paintPinch(home,dt)){this.canvas.dataset.atHome='true';return;}
    const posture=this.controller.posture;
    const runDistance=Math.max(0,home-characterHeight*.65*displayScale-8);
    const running=this.run.update(dt,state==='Awake'?posture.state:'neutral',posture.intensity,runDistance);
    const atHome=running.x===0&&running.opacity===0;
    const returning=running.state==='neutral'&&running.x!==0;
    if(running.state!=='unavailable')this.useRightMotion=returning?running.x>0:running.velocity>0||(running.velocity===0&&running.x>0);
    this.idleTime+=dt;
    const idleIndex=Math.floor(this.idleTime*characterTiming.idleFps)%this.clips.open.sprites.length;
    if(running.opacity<1)this.paint(this.clips.open,idleIndex,home+running.x,0,1-running.opacity,false,0,0,displayScale);
    // Reuse the posture hold clock: recognition gaps freeze effort too; neutral resets it.
    const ramp=(start:number)=>{const t=Math.max(0,Math.min(1,(running.heldSeconds-start)/.8));return t*t*(3-2*t);};
    const effort=ramp(leftRunSettings.mediumAfterSeconds)+ramp(leftRunSettings.strongAfterSeconds);
    const tremble=Math.sin(running.heldSeconds*Math.PI*12)*(.45*effort+Math.max(0,effort-1)*1.1)*Math.PI/180;
    if(running.opacity>0)this.paint(this.useRightMotion?this.clips.right:this.clips.left,running.index,home+running.x,running.rotation+tremble,running.opacity,true,effort,running.heldSeconds,displayScale);
    this.canvas.dataset.runEffort=String(effort);
    Object.assign(this.canvas.dataset,{
      idleFrame:String(idleIndex),idlePose:'open',atHome:String(atHome),
      runAngle:String(running.rotation*180/Math.PI),runFrame:String(running.index),heldSeconds:String(running.heldSeconds),
      runTier:String(running.tier),runFps:String(running.fps),runOpacity:String(running.opacity),runDistance:String(runDistance),
      runVelocity:String(running.velocity),runAsset:this.useRightMotion?'right-run':'left-run',travelX:String(running.x),homeX:String(home)
    });
  };

  hitTest(clientX:number,clientY:number):boolean {
    if(this.canvas.dataset.stretchPhase)return false;
    const rect=this.canvas.parentElement!.getBoundingClientRect();const style=getComputedStyle(this.canvas);
    const [ox,oy]=style.transformOrigin.split(' ').map(Number.parseFloat);
    const matrix=new DOMMatrix(style.transform==='none'?undefined:style.transform);
    const top=this.canvas.style.position==='fixed'?Number.parseFloat(this.canvas.style.top):rect.top;
    const local=new DOMPoint(clientX-rect.left-ox!,clientY-top-oy!).matrixTransform(matrix.inverse());
    const x=Math.floor((local.x+ox!)*this.canvas.width/rect.width),y=Math.floor((local.y+oy!)*this.canvas.height/Number.parseFloat(style.height));
    return x>=0&&y>=0&&x<this.canvas.width&&y<this.canvas.height&&this.context.getImageData(x,y,1,1).data[3]!>50;
  }
  dispose():void {this.disposed=true;this.canvas.removeEventListener('cheek-pinch',this.onPinch);window.removeEventListener('pointermove',this.onWalkPointer);this.finishWake();clearInterval(this.frame);}
}
