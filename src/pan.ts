import { PanImage, parseImage } from "./image";

export const enum Background {
  PreviousAnimation = 0,
  ClearToImage = 1,
  ClearToColor = 2,
}

export const enum Op {
  SetupSprite = 0x00,
  RemoveSprite = 0x01,
  WaitForFrames = 0x02,
  TriggerAudio = 0x03,
  StampSprite = 0x04,
  Push = 0x05,
  PopToRegister = 0x06,
  Dup = 0x07,
  CompareEqual = 0x08,
  CompareNotEqual = 0x09,
  CompareGreaterThan = 0x0a,
  CompareLessThan = 0x0b,
  CompareGreaterOrEqual = 0x0c,
  CompareLessOrEqual = 0x0d,
  Add = 0x0e,
  Subtract = 0x0f,
  Multiply = 0x10,
  Divide = 0x11,
  ConditionalJump = 0x12,
  Jump = 0x13,
  End = 0x14,
  EndImmediate = 0x15,
  Return = 0x16,
  Call = 0x17,
}

export const enum StepType {
  DrawFrame = 0x00,
  MoveAbsolute = 0x01,
  MoveRelative = 0x02,
  SetSpeed = 0x03,
  AddSpeed = 0x04,
  PushCounter = 0x05,
  JumpIfCounter = 0x06,
  Restart = 0x07,
  Loop = 0x08,
  Pause = 0x09,
  Stop = 0x0a,
}

export interface Instruction {
  offset: number;
  length: number;
  opcode: number;
  sub: number;
  value: number;
}

export interface Step {
  offset: number;
  length: number;
  type: number;
  a: number;
  b: number;
}

export interface ColorBlock {
  kind: number;
  mapping: Uint8Array;
  border: number;
  palette: Uint8Array;
}

export interface PanFile {
  name: string;
  size: number;
  rawImages: boolean;
  colorBlock: ColorBlock | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  frameDelay: number;
  backgroundType: number;
  clearColor: number;
  clearUnknown: number;
  background: PanImage | null;
  imageIdToIndex: Int16Array;
  imageMeta: Uint16Array;
  images: PanImage[];
  imageOffsets: number[];
  dataOffset: number;
  declaredDataLength: number;
  data: Uint8Array;
  instructions: Instruction[];
  steps: Step[];
  jumpTargets: Set<number>;
  stepStarts: Map<number, number[]>;
  stepTargets: Set<number>;
  warnings: string[];
}

export function u16(data: Uint8Array, offset: number): number {
  if (offset + 1 >= data.length) throw new Error(`Unexpected end of file at 0x${offset.toString(16)}`);
  return data[offset] | (data[offset + 1] << 8);
}

export function s16(data: Uint8Array, offset: number): number {
  return (u16(data, offset) << 16) >> 16;
}

export function instructionLength(opcode: number): number {
  if (opcode === Op.Push) return 4;
  if (opcode === Op.PopToRegister || opcode === Op.ConditionalJump || opcode === Op.Jump || opcode === Op.Call) return 3;
  if (opcode <= Op.Call) return 1;
  return 0;
}

export function stepLength(type: number): number {
  if (type === StepType.DrawFrame) return 2;
  if (type === StepType.MoveAbsolute || type === StepType.MoveRelative) return 5;
  if (type >= StepType.SetSpeed && type <= StepType.JumpIfCounter) return 3;
  if (type <= StepType.Stop) return 1;
  return 0;
}

export function decodeInstruction(data: Uint8Array, offset: number): Instruction | null {
  if (offset < 0 || offset >= data.length) return null;
  const opcode = data[offset];
  const length = instructionLength(opcode);
  if (length === 0 || offset + length > data.length) return null;
  const valueOffset = length === 4 ? offset + 2 : offset + 1;
  return {
    offset,
    length,
    opcode,
    sub: length === 4 ? data[offset + 1] : 0,
    value: length > 1 ? s16(data, valueOffset) : 0,
  };
}

export function decodeStep(data: Uint8Array, offset: number): Step | null {
  if (offset < 0 || offset >= data.length) return null;
  const type = data[offset];
  const length = stepLength(type);
  if (length === 0 || offset + length > data.length) return null;
  let a = 0;
  let b = 0;
  if (length === 2) a = data[offset + 1];
  else if (length === 3) a = type === StepType.JumpIfCounter ? u16(data, offset + 1) : s16(data, offset + 1);
  else if (length === 5) {
    a = s16(data, offset + 1);
    b = s16(data, offset + 3);
  }
  return { offset, length, type, a, b };
}

function scanInstructions(data: Uint8Array, warnings: string[]): { instructions: Instruction[]; jumpTargets: Set<number> } {
  const decoded = new Map<number, Instruction>();
  const jumpTargets = new Set<number>();
  const pending = [0];
  while (pending.length > 0) {
    const offset = pending.pop() as number;
    if (decoded.has(offset)) continue;
    const raw = decodeInstruction(data, offset);
    if (!raw) {
      warnings.push(`Invalid instruction at 0x${offset.toString(16).padStart(4, "0")}`);
      continue;
    }
    decoded.set(offset, raw);
    const target = raw.value & 0xffff;
    switch (raw.opcode) {
      case Op.ConditionalJump:
      case Op.Call:
        jumpTargets.add(target);
        pending.push(target, offset + raw.length);
        break;
      case Op.Jump:
        jumpTargets.add(target);
        pending.push(target);
        break;
      case Op.End:
      case Op.EndImmediate:
      case Op.Return:
        break;
      default:
        pending.push(offset + raw.length);
    }
  }
  const instructions = [...decoded.values()].sort((x, y) => x.offset - y.offset);
  return { instructions, jumpTargets };
}

export function literalArgs(instructions: Instruction[], index: number, count: number, jumpTargets: Set<number>): number[] | null {
  if (index < count) return null;
  const args: number[] = [];
  let end = instructions[index].offset;
  for (let i = index - 1; i >= index - count; i--) {
    const p = instructions[i];
    if (p.opcode !== Op.Push || p.sub !== 0 || p.offset + p.length !== end) return null;
    if (i !== index - count && jumpTargets.has(p.offset)) return null;
    end = p.offset;
    args.unshift(p.value);
  }
  return args;
}

function findStepStarts(instructions: Instruction[], jumpTargets: Set<number>): Map<number, number[]> {
  const starts = new Map<number, number[]>();
  for (let i = 0; i < instructions.length; i++) {
    if (instructions[i].opcode !== Op.SetupSprite) continue;
    const args = literalArgs(instructions, i, 7, jumpTargets);
    if (!args) continue;
    const pointer = args[0] & 0xffff;
    const sprite = args[1];
    const list = starts.get(pointer) ?? [];
    if (!list.includes(sprite)) list.push(sprite);
    starts.set(pointer, list.sort((x, y) => x - y));
  }
  return starts;
}

function scanSteps(data: Uint8Array, starts: Iterable<number>, warnings: string[]): { steps: Step[]; stepTargets: Set<number> } {
  const decoded = new Map<number, Step>();
  const stepTargets = new Set<number>();
  const pending = [...starts];
  while (pending.length > 0) {
    const offset = pending.pop() as number;
    if (decoded.has(offset)) continue;
    const raw = decodeStep(data, offset);
    if (!raw) {
      warnings.push(`Invalid step at 0x${offset.toString(16).padStart(4, "0")}`);
      continue;
    }
    decoded.set(offset, raw);
    switch (raw.type) {
      case StepType.JumpIfCounter:
        stepTargets.add(raw.a);
        pending.push(raw.a, offset + raw.length);
        break;
      case StepType.Restart:
      case StepType.Loop:
      case StepType.Pause:
      case StepType.Stop:
        break;
      default:
        pending.push(offset + raw.length);
    }
  }
  const steps = [...decoded.values()].sort((x, y) => x.offset - y.offset);
  return { steps, stepTargets };
}

export function parsePan(name: string, bytes: Uint8Array): PanFile {
  const warnings: string[] = [];
  if (bytes.length < 8 || bytes[0] !== 0x50 || bytes[1] !== 0x41 || bytes[2] !== 0x4e || bytes[3] !== 0x49) {
    throw new Error("Not a PAN file (missing PANI magic)");
  }
  if (bytes[4] !== 0x03) throw new Error(`Unsupported PAN version ${bytes[4]}`);
  const rawImages = bytes[5] === 0;
  let offset = 6;
  let colorBlock: ColorBlock | null = null;
  if (bytes[offset++] !== 0) {
    const kind = bytes[offset++];
    const block: ColorBlock = { kind, mapping: new Uint8Array(16), border: 0, palette: new Uint8Array(0) };
    for (let i = 0; i < 16; i++) block.mapping[i] = i;
    if (kind === 0x00) {
      block.mapping = bytes.slice(offset, offset + 16);
      block.border = bytes[offset + 16];
      offset += 17;
    } else if (kind === 0x02) {
      block.palette = bytes.slice(offset, offset + 774);
      offset += 774;
    } else if (kind !== 0x01) {
      warnings.push(`Unexpected colour block kind 0x${kind.toString(16)}`);
    }
    colorBlock = block;
  }
  const positionX = u16(bytes, offset);
  const positionY = u16(bytes, offset + 2);
  const width = u16(bytes, offset + 4) + 1;
  const height = u16(bytes, offset + 6) + 1;
  const frameDelay = u16(bytes, offset + 8);
  const backgroundType = bytes[offset + 10];
  offset += 11;

  let background: PanImage | null = null;
  if (backgroundType === Background.ClearToImage) {
    const result = parseImage(bytes, offset, rawImages);
    background = result.image;
    offset = result.end;
  }
  let clearColor = 0;
  let clearUnknown = 0;
  if (backgroundType === Background.ClearToColor) {
    clearColor = bytes[offset];
    clearUnknown = bytes[offset + 1];
    offset += 2;
  }

  const imageIdToIndex = new Int16Array(250).fill(-1);
  const metaList: number[] = [];
  let count = 0;
  for (let id = 0; id < 250; id++) {
    const entry = u16(bytes, offset);
    offset += 2;
    if (entry === 0) continue;
    imageIdToIndex[id] = count++;
    metaList.push(entry);
  }
  const images: PanImage[] = [];
  const imageOffsets: number[] = [];
  for (let i = 0; i < count; i++) {
    imageOffsets.push(offset);
    const result = parseImage(bytes, offset, rawImages);
    images.push(result.image);
    offset = result.end;
  }

  const declaredDataLength = u16(bytes, offset) * 16;
  offset += 2;
  const dataOffset = offset;
  const available = bytes.length - dataOffset;
  if (available !== declaredDataLength) {
    warnings.push(`Data section declares ${declaredDataLength} bytes but ${available} remain`);
  }
  const data = bytes.slice(dataOffset, dataOffset + Math.min(declaredDataLength, available));

  const { instructions, jumpTargets } = scanInstructions(data, warnings);
  const stepStarts = findStepStarts(instructions, jumpTargets);
  const { steps, stepTargets } = scanSteps(data, stepStarts.keys(), warnings);

  return {
    name,
    size: bytes.length,
    rawImages,
    colorBlock,
    positionX,
    positionY,
    width,
    height,
    frameDelay,
    backgroundType,
    clearColor,
    clearUnknown,
    background,
    imageIdToIndex,
    imageMeta: Uint16Array.from(metaList),
    images,
    imageOffsets,
    dataOffset,
    declaredDataLength,
    data,
    instructions,
    steps,
    jumpTargets,
    stepStarts,
    stepTargets,
    warnings,
  };
}
