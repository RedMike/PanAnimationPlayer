import { PanImage } from "./image";
import { Background, Op, PanFile, StepType, decodeInstruction, decodeStep } from "./pan";

export const MAX_SPRITES = 50;
export const MAX_REGISTERS = 51;
const MAX_INSTRUCTIONS_PER_FRAME = 100000;
const MAX_STEPS_PER_FRAME = 100000;

export interface Sprite {
  index: number;
  exists: boolean;
  active: boolean;
  stamped: boolean;
  followIndex: number;
  counters: number[];
  imageId: number;
  originalX: number;
  originalY: number;
  x: number;
  y: number;
  originalStep: number;
  step: number;
  credit: number;
  speed: number;
  rate: number;
  flags: number;
  lastSteps: number[];
}

export interface RegisterInput {
  value: number;
  frame: number;
}

function s16(v: number): number {
  return (v << 16) >> 16;
}

function makeSprite(index: number): Sprite {
  return {
    index,
    exists: false,
    active: false,
    stamped: false,
    followIndex: -1,
    counters: [],
    imageId: -1,
    originalX: 0,
    originalY: 0,
    x: 0,
    y: 0,
    originalStep: 0,
    step: 0,
    credit: 0,
    speed: 0,
    rate: 0,
    flags: 0,
    lastSteps: [],
  };
}

export class Engine {
  readonly width: number;
  readonly height: number;
  readonly background: Uint8Array;
  readonly frame: Uint8Array;
  readonly palette = new Uint8Array(16);
  readonly sprites: Sprite[] = [];
  readonly stack: number[] = [];
  readonly registers = new Int32Array(MAX_REGISTERS);
  ip = 0;
  waiting = false;
  waitCount = 0;
  framesToWait = 0;
  currentFrame = -1;
  ended = false;
  endReached = false;
  lastInstructions: number[] = [];
  audio: number[] = [];
  warnings: string[] = [];

  private readonly rowMin: Int32Array;
  private readonly rowMax: Int32Array;
  private dirtyMinY = Number.MAX_SAFE_INTEGER;
  private dirtyMaxY = -1;
  private audioQueue: number[] = [];
  private warned = new Set<string>();

  constructor(readonly pan: PanFile) {
    this.width = pan.width;
    this.height = pan.height;
    this.rowMin = new Int32Array(this.height);
    this.rowMax = new Int32Array(this.height);
    this.resetDirty();
    for (let i = 0; i <= MAX_SPRITES; i++) this.sprites.push(makeSprite(i));
    this.buildPalette();
    this.background = new Uint8Array(this.width * this.height);
    if (pan.backgroundType === Background.ClearToImage && pan.background) {
      this.draw(this.background, pan.background, 0, 0, false);
    } else if (pan.backgroundType === Background.ClearToColor) {
      this.background.fill(pan.clearColor);
    }
    this.frame = this.background.slice();
  }

  clone(): Engine {
    const copy = new Engine(this.pan);
    copy.background.set(this.background);
    copy.frame.set(this.frame);
    for (let i = 0; i <= MAX_SPRITES; i++) {
      copy.sprites[i] = { ...this.sprites[i], counters: [...this.sprites[i].counters], lastSteps: [...this.sprites[i].lastSteps] };
    }
    copy.stack.push(...this.stack);
    copy.registers.set(this.registers);
    copy.ip = this.ip;
    copy.waiting = this.waiting;
    copy.waitCount = this.waitCount;
    copy.framesToWait = this.framesToWait;
    copy.currentFrame = this.currentFrame;
    copy.ended = this.ended;
    copy.endReached = this.endReached;
    copy.lastInstructions = [...this.lastInstructions];
    copy.audio = [...this.audio];
    copy.warnings = [...this.warnings];
    copy.rowMin.set(this.rowMin);
    copy.rowMax.set(this.rowMax);
    copy.dirtyMinY = this.dirtyMinY;
    copy.dirtyMaxY = this.dirtyMaxY;
    copy.warned = new Set(this.warned);
    return copy;
  }

  private buildPalette(): void {
    for (let i = 0; i < 16; i++) this.palette[i] = i;
    const block = this.pan.colorBlock;
    if (block && block.kind === 0x00) {
      for (let i = 0; i < 16; i++) this.palette[i] = block.mapping[i] & 0x0f;
    } else if (block && block.kind === 0x02) {
      for (let i = 0; i < 16 && i < block.palette.length; i++) this.palette[i] = block.palette[i] & 0x0f;
    }
    this.palette[0] = 0;
  }

  sprite(index: number): Sprite | null {
    if (index < 1 || index > MAX_SPRITES) return null;
    const sprite = this.sprites[index];
    return sprite.exists ? sprite : null;
  }

  spritePosition(sprite: Sprite): { x: number; y: number } | null {
    if (sprite.followIndex === -1) return { x: sprite.x, y: sprite.y };
    if (sprite.followIndex < 1 || sprite.followIndex > MAX_SPRITES) return null;
    const followed = this.sprites[sprite.followIndex];
    if (!followed.exists || !followed.active) return null;
    return { x: followed.x + sprite.originalX + sprite.x, y: followed.y + sprite.originalY + sprite.y };
  }

  applyRegisters(inputs: Map<number, RegisterInput>, frame: number): void {
    for (const [register, input] of inputs) {
      if (input.frame === frame && register >= 0 && register < MAX_REGISTERS) this.registers[register] = input.value;
    }
  }

  runFrame(): boolean {
    if (this.ended) return false;
    this.currentFrame++;
    this.lastInstructions = [];
    this.audio = [];
    for (const sprite of this.sprites) if (sprite.active) sprite.stamped = false;
    if (!this.runInstructions()) {
      this.ended = true;
      return false;
    }
    this.stepSprites();
    this.drawStamps();
    this.restore();
    this.drawSprites();
    this.audio = this.audioQueue.reverse();
    this.audioQueue = [];
    return true;
  }

  private runInstructions(): boolean {
    const data = this.pan.data;
    let executed = 0;
    for (;;) {
      if (this.waiting) {
        const remaining = this.waitCount;
        this.waitCount = s16(this.waitCount - 1);
        if (remaining !== 0) {
          this.framesToWait = this.waitCount;
          return true;
        }
        this.waiting = false;
        this.framesToWait = 0;
      }
      const ins = decodeInstruction(data, this.ip);
      if (!ins) {
        this.warn(`Invalid instruction at 0x${this.ip.toString(16)}`);
        return true;
      }
      if (++executed > MAX_INSTRUCTIONS_PER_FRAME) {
        this.warn("Instructions loop without waiting for a frame");
        return true;
      }
      this.lastInstructions.push(this.ip);
      let next = this.ip + ins.length;
      const target = ins.value & 0xffff;
      switch (ins.opcode) {
        case Op.SetupSprite:
          this.setupSprite();
          break;
        case Op.RemoveSprite: {
          const sprite = this.sprite(this.pop());
          if (sprite) sprite.active = false;
          break;
        }
        case Op.WaitForFrames:
          this.waitCount = this.pop();
          this.waiting = true;
          break;
        case Op.TriggerAudio:
          this.audioQueue.push(this.pop());
          break;
        case Op.StampSprite: {
          const sprite = this.sprite(this.pop());
          if (sprite) sprite.stamped = true;
          break;
        }
        case Op.Push:
          this.push(ins.sub === 0 ? ins.value : this.getRegister(ins.value));
          break;
        case Op.PopToRegister: {
          const value = this.pop();
          if (ins.value >= 0 && ins.value < MAX_REGISTERS) this.registers[ins.value] = value;
          break;
        }
        case Op.Dup: {
          const value = this.pop();
          this.push(value);
          this.push(value);
          break;
        }
        case Op.CompareEqual:
        case Op.CompareNotEqual:
        case Op.CompareGreaterThan:
        case Op.CompareLessThan:
        case Op.CompareGreaterOrEqual:
        case Op.CompareLessOrEqual:
        case Op.Add:
        case Op.Subtract:
        case Op.Multiply:
        case Op.Divide: {
          const second = this.pop();
          const first = this.pop();
          if (ins.opcode === Op.Divide && second === 0) this.warn("Division by zero");
          this.push(compute(ins.opcode, first, second));
          break;
        }
        case Op.ConditionalJump:
          if (this.pop() !== 0) next = target;
          break;
        case Op.Jump:
          next = target;
          break;
        case Op.Call:
          this.push(next);
          next = target;
          break;
        case Op.Return:
          next = this.pop() & 0xffff;
          break;
        case Op.End:
          this.endReached = true;
          return true;
        case Op.EndImmediate:
          this.endReached = true;
          return false;
        default:
          this.warn(`Unknown instruction 0x${ins.opcode.toString(16)} at 0x${this.ip.toString(16)}`);
          return true;
      }
      this.ip = next;
    }
  }

  private setupSprite(): void {
    const flags = this.pop();
    const rate = this.pop();
    const y = this.pop();
    const x = this.pop();
    const followIndex = this.pop();
    let index = this.pop();
    const step = this.pop() & 0xffff;
    if (index === -1) {
      index = MAX_SPRITES;
      for (let i = 1; i <= MAX_SPRITES; i++) {
        if (!this.sprites[i].active) {
          index = i;
          break;
        }
      }
    }
    if (index < 1 || index > MAX_SPRITES) return;
    const sprite = this.sprites[index];
    sprite.exists = true;
    sprite.active = true;
    sprite.stamped = false;
    sprite.followIndex = followIndex;
    sprite.originalX = x;
    sprite.originalY = y;
    sprite.x = followIndex === -1 ? x : 0;
    sprite.y = followIndex === -1 ? y : 0;
    sprite.rate = rate;
    sprite.speed = rate;
    sprite.credit = 255;
    sprite.counters = [];
    sprite.originalStep = step;
    sprite.step = step;
    sprite.flags = flags;
    sprite.lastSteps = [];
  }

  private push(value: number): void {
    this.stack.push(s16(value));
  }

  private pop(): number {
    if (this.stack.length === 0) {
      this.warn("Stack underflow");
      return 0;
    }
    return this.stack.pop() as number;
  }

  private getRegister(register: number): number {
    if (register < 0 || register >= MAX_REGISTERS) {
      this.warn(`Register ${register} is out of range`);
      return 0;
    }
    return this.registers[register];
  }

  private stepSprites(): void {
    for (let i = 1; i <= MAX_SPRITES; i++) {
      const sprite = this.sprites[i];
      if (!sprite.active) continue;
      sprite.lastSteps = [];
      sprite.credit = s16(sprite.credit + sprite.speed);
      if (sprite.credit <= 255) continue;
      sprite.credit -= 255;
      this.runSteps(sprite);
    }
  }

  private runSteps(sprite: Sprite): void {
    const data = this.pan.data;
    let executed = 0;
    for (;;) {
      const step = decodeStep(data, sprite.step);
      if (!step) {
        this.warn(`Sprite ${sprite.index} hit an invalid step at 0x${sprite.step.toString(16)}`);
        sprite.active = false;
        return;
      }
      if (++executed > MAX_STEPS_PER_FRAME) {
        this.warn(`Sprite ${sprite.index} steps loop without drawing a frame`);
        sprite.active = false;
        return;
      }
      sprite.lastSteps.push(sprite.step);
      let next = sprite.step + step.length;
      switch (step.type) {
        case StepType.DrawFrame:
          sprite.imageId = step.a === 0xff ? -1 : step.a;
          sprite.step = next;
          return;
        case StepType.MoveAbsolute:
          sprite.x = step.a;
          sprite.y = step.b;
          break;
        case StepType.MoveRelative:
          sprite.x = s16(sprite.x + step.a);
          sprite.y = s16(sprite.y + step.b);
          break;
        case StepType.SetSpeed:
          sprite.speed = step.a;
          break;
        case StepType.AddSpeed:
          sprite.speed = s16(sprite.speed + step.a);
          break;
        case StepType.PushCounter:
          sprite.counters.push(step.a);
          break;
        case StepType.JumpIfCounter: {
          if (sprite.counters.length === 0) {
            this.warn(`Sprite ${sprite.index} jumps on a counter without one`);
            break;
          }
          const last = sprite.counters.length - 1;
          sprite.counters[last] = s16(sprite.counters[last] - 1);
          if (sprite.counters[last] !== 0) next = step.a;
          else sprite.counters.pop();
          break;
        }
        case StepType.Restart:
          sprite.x = sprite.followIndex === -1 ? sprite.originalX : 0;
          sprite.y = sprite.followIndex === -1 ? sprite.originalY : 0;
          sprite.speed = sprite.rate;
          sprite.credit = 255;
          sprite.counters = [];
          next = sprite.originalStep;
          break;
        case StepType.Loop:
          sprite.counters = [];
          next = sprite.originalStep;
          break;
        case StepType.Pause:
          return;
        case StepType.Stop:
          sprite.active = false;
          return;
        default:
          this.warn(`Sprite ${sprite.index} hit unknown step ${step.type}`);
          sprite.active = false;
          return;
      }
      sprite.step = next;
    }
  }

  image(sprite: Sprite): PanImage | null {
    if (sprite.imageId < 0) return null;
    const index = this.pan.imageIdToIndex[sprite.imageId];
    return index >= 0 ? this.pan.images[index] : null;
  }

  private drawStamps(): void {
    for (let i = 1; i <= MAX_SPRITES; i++) {
      const sprite = this.sprites[i];
      if (!sprite.active || !sprite.stamped) continue;
      const image = this.stampImage(sprite);
      const pos = this.spritePosition(sprite);
      if (!image || !pos) continue;
      this.draw(this.background, image, pos.x, pos.y, true);
      this.markDirty(pos.x, pos.y, image.width, image.height);
    }
  }

  private stampImage(sprite: Sprite): PanImage | null {
    if (sprite.imageId < 0) {
      this.warn(`Sprite ${sprite.index} is stamped without an image`);
      return null;
    }
    const image = this.image(sprite);
    if (!image) this.warn(`Sprite ${sprite.index} uses missing image ${sprite.imageId}`);
    return image;
  }

  private drawSprites(): void {
    for (let i = 1; i <= MAX_SPRITES; i++) {
      const sprite = this.sprites[i];
      if (!sprite.active || sprite.stamped || sprite.imageId < 0) continue;
      const image = this.image(sprite);
      const pos = this.spritePosition(sprite);
      if (!image) {
        this.warn(`Sprite ${sprite.index} uses missing image ${sprite.imageId}`);
        continue;
      }
      if (!pos) continue;
      this.draw(this.frame, image, pos.x, pos.y, true);
      if (sprite.flags === 0) this.markDirty(pos.x, pos.y, image.width, image.height);
    }
  }

  private draw(page: Uint8Array, image: PanImage, x: number, y: number, transparent: boolean): void {
    const { width, height, pixels } = image;
    for (let py = 0; py < height; py++) {
      const ty = y + py;
      if (ty < 0 || ty >= this.height) continue;
      const src = py * width;
      const dst = ty * this.width;
      for (let px = 0; px < width; px++) {
        const tx = x + px;
        if (tx < 0 || tx >= this.width) continue;
        const color = pixels[src + px];
        if (transparent && color === 0) continue;
        page[dst + tx] = color;
      }
    }
  }

  private markDirty(x: number, y: number, width: number, height: number): void {
    const first = Math.max(y, 0);
    const last = Math.min(y + height - 1, this.height - 1);
    if (first > last || width <= 0) return;
    this.dirtyMinY = Math.min(this.dirtyMinY, first);
    this.dirtyMaxY = Math.max(this.dirtyMaxY, last);
    for (let row = first; row <= last; row++) {
      this.rowMin[row] = Math.min(this.rowMin[row], x);
      this.rowMax[row] = Math.max(this.rowMax[row], x + width - 1);
    }
  }

  private restore(): void {
    if (this.dirtyMaxY < 0) return;
    for (let row = this.dirtyMinY; row <= this.dirtyMaxY; row++) {
      const first = Math.max(this.rowMin[row], 0);
      const last = Math.min(this.rowMax[row], this.width - 1);
      if (first > last) continue;
      const start = row * this.width + first;
      this.frame.set(this.background.subarray(start, start + last - first + 1), start);
    }
    this.resetDirty();
  }

  private resetDirty(): void {
    this.dirtyMinY = Number.MAX_SAFE_INTEGER;
    this.dirtyMaxY = -1;
    this.rowMin.fill(0x7fffffff);
    this.rowMax.fill(-1);
  }

  private warn(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.warnings.push(`Frame ${this.currentFrame}: ${message}`);
  }
}

function compute(opcode: number, first: number, second: number): number {
  switch (opcode) {
    case Op.CompareEqual:
      return first === second ? 1 : 0;
    case Op.CompareNotEqual:
      return first !== second ? 1 : 0;
    case Op.CompareGreaterThan:
      return first > second ? 1 : 0;
    case Op.CompareLessThan:
      return first < second ? 1 : 0;
    case Op.CompareGreaterOrEqual:
      return first >= second ? 1 : 0;
    case Op.CompareLessOrEqual:
      return first <= second ? 1 : 0;
    case Op.Add:
      return first + second;
    case Op.Subtract:
      return first - second;
    case Op.Multiply:
      return Math.imul(first, second);
    case Op.Divide:
      return second === 0 ? 0 : Math.trunc(first / second);
    default:
      return 0;
  }
}
