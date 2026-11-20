/** Bridge gesture recognition to the existing Canvas animation loop. */
export class CheekPinchReaction {
  private pinching = false;
  private mirrored = false;
  setPinching(on: boolean, mirrored = false): void {
    if (on === this.pinching && (!on || mirrored === this.mirrored)) return;
    this.pinching = on;
    if(on) this.mirrored = mirrored;
    this.send({on,mirrored:this.mirrored});
  }
  detach(): void { this.pinching=false; this.send({cancel:true}); }
  private send(detail: {on?:boolean;mirrored?:boolean;cancel?:boolean}): void {
    document.querySelector('#character canvas')?.dispatchEvent(new CustomEvent('cheek-pinch', {detail}));
  }
}
