import { Instruction, Op, PanFile, Step, StepType, literalArgs } from "./pan";

export const OP_NAMES: Record<number, string> = {
  [Op.SetupSprite]: "SetupSprite",
  [Op.RemoveSprite]: "RemoveSprite",
  [Op.WaitForFrames]: "WaitForFrames",
  [Op.TriggerAudio]: "TriggerAudio",
  [Op.StampSprite]: "StampSprite",
  [Op.Push]: "Push",
  [Op.PopToRegister]: "PopToRegister",
  [Op.Dup]: "Dup",
  [Op.CompareEqual]: "CompareEqual",
  [Op.CompareNotEqual]: "CompareNotEqual",
  [Op.CompareGreaterThan]: "CompareGreaterThan",
  [Op.CompareLessThan]: "CompareLessThan",
  [Op.CompareGreaterOrEqual]: "CompareGreaterOrEqual",
  [Op.CompareLessOrEqual]: "CompareLessOrEqual",
  [Op.Add]: "Add",
  [Op.Subtract]: "Subtract",
  [Op.Multiply]: "Multiply",
  [Op.Divide]: "Divide",
  [Op.ConditionalJump]: "JumpIf",
  [Op.Jump]: "Jump",
  [Op.End]: "End",
  [Op.EndImmediate]: "EndImmediate",
  [Op.Return]: "Return",
  [Op.Call]: "Call",
};

export const STEP_NAMES: Record<number, string> = {
  [StepType.DrawFrame]: "DrawFrame",
  [StepType.MoveAbsolute]: "MoveAbsolute",
  [StepType.MoveRelative]: "MoveRelative",
  [StepType.SetSpeed]: "SetSpeed",
  [StepType.AddSpeed]: "AddSpeed",
  [StepType.PushCounter]: "PushCounter",
  [StepType.JumpIfCounter]: "JumpIfCounter",
  [StepType.Restart]: "Restart",
  [StepType.Loop]: "Loop",
  [StepType.Pause]: "Pause",
  [StepType.Stop]: "Stop",
};

const POPS: Record<number, number> = {
  [Op.SetupSprite]: 7,
  [Op.RemoveSprite]: 1,
  [Op.WaitForFrames]: 1,
  [Op.TriggerAudio]: 1,
  [Op.StampSprite]: 1,
  [Op.CompareEqual]: 2,
  [Op.CompareNotEqual]: 2,
  [Op.CompareGreaterThan]: 2,
  [Op.CompareLessThan]: 2,
  [Op.CompareGreaterOrEqual]: 2,
  [Op.CompareLessOrEqual]: 2,
  [Op.Add]: 2,
  [Op.Subtract]: 2,
  [Op.Multiply]: 2,
  [Op.Divide]: 2,
};

export function hex(value: number, digits = 4): string {
  return "0x" + (value & 0xffff).toString(16).padStart(digits, "0");
}

export function bytesText(data: Uint8Array, offset: number, length: number): string {
  const parts: string[] = [];
  for (let i = 0; i < length; i++) parts.push(data[offset + i].toString(16).padStart(2, "0"));
  return parts.join(" ");
}

export function opName(opcode: number): string {
  return OP_NAMES[opcode] ?? `Unknown(${hex(opcode, 2)})`;
}

export function stepName(type: number): string {
  return STEP_NAMES[type] ?? `Unknown(${hex(type, 2)})`;
}

export function instructionOperand(ins: Instruction): string {
  switch (ins.opcode) {
    case Op.Push:
      return ins.sub === 0 ? String(ins.value) : `R${ins.value}`;
    case Op.PopToRegister:
      return `R${ins.value}`;
    case Op.ConditionalJump:
    case Op.Jump:
    case Op.Call:
      return hex(ins.value);
    default:
      return "";
  }
}

export function instructionHint(pan: PanFile, index: number): string {
  const ins = pan.instructions[index];
  const pops = POPS[ins.opcode];
  if (!pops) return "";
  const args = literalArgs(pan.instructions, index, pops, pan.jumpTargets);
  if (!args) return "";
  switch (ins.opcode) {
    case Op.SetupSprite:
      return `sprite ${args[1]} follow ${args[2]} at (${args[3]}, ${args[4]}) rate ${args[5]} flags ${args[6]} steps ${hex(args[0])}`;
    case Op.RemoveSprite:
    case Op.StampSprite:
      return `sprite ${args[0]}`;
    case Op.WaitForFrames:
      return `${args[0]} frames`;
    case Op.TriggerAudio:
      return `audio ${args[0]}`;
    default:
      return `${args[0]}, ${args[1]}`;
  }
}

export function stepOperand(step: Step): string {
  switch (step.type) {
    case StepType.DrawFrame:
      return step.a === 0xff ? "none" : `image ${step.a}`;
    case StepType.MoveAbsolute:
      return `(${step.a}, ${step.b})`;
    case StepType.MoveRelative:
      return `(${step.a >= 0 ? "+" : ""}${step.a}, ${step.b >= 0 ? "+" : ""}${step.b})`;
    case StepType.SetSpeed:
    case StepType.AddSpeed:
    case StepType.PushCounter:
      return String(step.a);
    case StepType.JumpIfCounter:
      return hex(step.a);
    default:
      return "";
  }
}

export function backgroundName(type: number): string {
  return ["PreviousAnimation", "ClearToImage", "ClearToColor"][type] ?? `Unknown(${type})`;
}
