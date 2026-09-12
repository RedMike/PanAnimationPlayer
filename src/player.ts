import { PanFile } from "./pan";
import { Engine, RegisterInput } from "./sim";

const TICK_MS = 1000 / 18.2;

export class Player {
  engine: Engine;
  inputs = new Map<number, RegisterInput>();
  maxFrames = 500;
  speed = 1;
  lastFrame = 500;
  playing = false;
  onFrame: () => void = () => {};
  onPlayState: () => void = () => {};

  private timer = 0;

  constructor(readonly pan: PanFile) {
    this.engine = new Engine(pan);
    this.reset();
  }

  get frame(): number {
    return this.engine.currentFrame;
  }

  get atEnd(): boolean {
    return this.engine.ended || this.frame >= this.lastFrame;
  }

  reset(): void {
    this.probeLength();
    this.replayTo(Math.min(Math.max(this.frame, 0), this.lastFrame));
  }

  setInput(register: number, value: number, frame: number): void {
    if (value === 0 && frame === 0) this.inputs.delete(register);
    else this.inputs.set(register, { value, frame });
    this.reset();
  }

  clearInputs(): void {
    this.inputs.clear();
    this.reset();
  }

  setMaxFrames(frames: number): void {
    this.maxFrames = Math.max(1, frames);
    this.reset();
  }

  seek(frame: number): void {
    frame = Math.max(0, Math.min(frame, this.lastFrame));
    if (frame < this.engine.currentFrame) this.replayTo(frame);
    else this.advanceTo(frame);
    this.onFrame();
  }

  step(delta: number): void {
    this.seek(this.frame + delta);
  }

  rewind(): void {
    this.seek(0);
  }

  play(): void {
    if (this.playing) return;
    if (this.atEnd) this.seek(0);
    this.playing = true;
    this.onPlayState();
    this.schedule();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.timer);
    this.onPlayState();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  private schedule(): void {
    const delay = (Math.max(this.pan.frameDelay, 1) * TICK_MS) / this.speed;
    this.timer = window.setTimeout(() => {
      if (!this.playing) return;
      this.seek(this.frame + 1);
      if (this.atEnd) this.pause();
      else this.schedule();
    }, delay);
  }

  private probeLength(): void {
    const engine = new Engine(this.pan);
    let frame = 0;
    for (; frame < this.maxFrames; frame++) {
      engine.applyRegisters(this.inputs, frame);
      if (!engine.runFrame()) break;
    }
    this.lastFrame = Math.min(frame, this.maxFrames);
  }

  private replayTo(frame: number): void {
    this.engine = new Engine(this.pan);
    this.advanceTo(frame);
  }

  private advanceTo(frame: number): void {
    while (this.engine.currentFrame < frame && !this.engine.ended) {
      this.engine.applyRegisters(this.inputs, this.engine.currentFrame + 1);
      this.engine.runFrame();
    }
  }
}
