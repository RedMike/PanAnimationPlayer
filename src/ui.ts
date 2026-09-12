import { backgroundName, bytesText, hex, instructionHint, instructionOperand, opName, stepName, stepOperand } from "./disasm";
import { PanImage } from "./image";
import { COLOR_NAMES, cssColor, toRgba } from "./palette";
import { Background, Op, PanFile } from "./pan";
import { Player } from "./player";
import { Engine, MAX_REGISTERS, MAX_SPRITES } from "./sim";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

export function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function cell(text: string, className = ""): HTMLTableCellElement {
  return el("td", { textContent: text, className });
}

function jumpLink(target: number, listId: string): HTMLAnchorElement {
  const link = el("a", { className: "jump", textContent: hex(target) });
  link.onclick = () => {
    const row = document.querySelector<HTMLElement>(`#${listId} tr[data-offset="${target}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("hit");
    setTimeout(() => row?.classList.remove("hit"), 1200);
  };
  return link;
}

function imageCanvas(image: PanImage, palette: Uint8Array, scale: number): HTMLCanvasElement {
  const canvas = el("canvas", { width: image.width, height: image.height });
  canvas.style.width = `${image.width * scale}px`;
  canvas.style.height = `${image.height * scale}px`;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const data = ctx.createImageData(image.width, image.height);
  toRgba(image.pixels, palette, data.data, true);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export class DebugView {
  private instructionRows = new Map<number, HTMLTableRowElement>();
  private stepRows = new Map<number, HTMLTableRowElement>();
  private stepSpriteCells = new Map<number, HTMLTableCellElement>();
  private ranInstructions: HTMLTableRowElement[] = [];
  private ranSteps: HTMLTableRowElement[] = [];
  private ipRow: HTMLTableRowElement | null = null;
  private stepRowsHit: HTMLTableRowElement[] = [];
  selectedSprite = 0;
  onSelectSprite: () => void = () => {};

  constructor(private player: Player) {}

  get pan(): PanFile {
    return this.player.pan;
  }

  build(): void {
    this.buildInfo();
    this.buildImages();
    this.buildInstructions();
    this.buildSteps();
    this.update();
  }

  private buildInfo(): void {
    const pan = this.pan;
    const tab = byId("tab-info");
    tab.replaceChildren();
    const dl = el("dl");
    const add = (k: string, v: string | Node) => dl.append(el("dt", { textContent: k }), el("dd", {}, v));
    add("File", `${pan.name} (${pan.size} bytes)`);
    add("Size", `${pan.width} x ${pan.height}`);
    add("Position", `${pan.positionX}, ${pan.positionY}`);
    add("Frame delay", `${pan.frameDelay} tick${pan.frameDelay === 1 ? "" : "s"} (${(18.2 / Math.max(pan.frameDelay, 1)).toFixed(1)} fps)`);
    let background = backgroundName(pan.backgroundType);
    if (pan.backgroundType === Background.ClearToColor) background += ` (colour ${pan.clearColor}, extra byte ${pan.clearUnknown})`;
    if (pan.backgroundType === Background.ClearToImage && pan.background) background += ` (${pan.background.width} x ${pan.background.height})`;
    add("Background", background);
    add("Image format", pan.rawImages ? "raw" : "compressed");
    add("Images", `${pan.images.length}${pan.background ? " + background" : ""}`);
    add("Data section", `${pan.data.length} bytes at file offset ${hex(pan.dataOffset)} (declared ${pan.declaredDataLength})`);
    add("Instructions", `${pan.instructions.length} reachable`);
    add("Steps", `${pan.steps.length} reachable in ${pan.stepStarts.size} sequence${pan.stepStarts.size === 1 ? "" : "s"}`);
    const registers = new Set<number>();
    for (const ins of pan.instructions) {
      if ((ins.opcode === Op.Push && ins.sub !== 0) || ins.opcode === Op.PopToRegister) registers.add(ins.value);
    }
    add("Registers used", registers.size ? [...registers].sort((a, b) => a - b).map((r) => `R${r}`).join(", ") : "none");
    tab.append(dl);

    const block = pan.colorBlock;
    if (block) {
      tab.append(el("h3", { textContent: `Colour block (kind ${block.kind})` }));
      if (block.kind === 0x00 || block.kind === 0x02) {
        const swatches = el("div", { className: "swatches" });
        const palette = this.player.engine.palette;
        for (let i = 0; i < 16; i++) {
          const shown = palette[i];
          const swatch = el("div", { className: "swatch", textContent: `${i}→${shown}`, title: `colour ${i} shows as ${COLOR_NAMES[shown]}` });
          swatch.style.background = cssColor(shown);
          swatch.style.color = shown === 0 || shown === 1 || shown === 4 || shown === 5 || shown === 8 ? "#fff" : "#000";
          swatches.append(swatch);
        }
        tab.append(swatches);
        if (block.kind === 0x00) tab.append(el("div", { className: "muted", textContent: `Border colour ${block.border}` }));
      } else {
        tab.append(el("div", { className: "muted", textContent: "No block, the previous palette stays in effect" }));
      }
    } else {
      tab.append(el("h3", { textContent: "Colour block" }), el("div", { className: "muted", textContent: "Absent, palette left untouched" }));
    }

    tab.append(el("h3", { textContent: "Image table" }));
    const table = el("table");
    table.append(el("thead", {}, el("tr", {}, el("th", { textContent: "ID" }), el("th", { textContent: "Index" }), el("th", { textContent: "Size" }), el("th", { textContent: "Offset" }), el("th", { textContent: "Extra" }))));
    const body = el("tbody");
    for (let id = 0; id < 250; id++) {
      const index = pan.imageIdToIndex[id];
      if (index < 0) continue;
      const image = pan.images[index];
      body.append(el("tr", {}, cell(String(id)), cell(String(index)), cell(`${image.width} x ${image.height}`), cell(hex(pan.imageOffsets[index]), "dim"), cell(hex(pan.imageMeta[index]), "dim")));
    }
    table.append(body);
    tab.append(table);
  }

  private buildImages(): void {
    const pan = this.pan;
    const palette = this.player.engine.palette;
    const tab = byId("tab-images");
    tab.replaceChildren();
    const grid = el("div", { className: "image-grid" });
    const card = (image: PanImage, label: string) => {
      const scale = image.width > 160 || image.height > 120 ? 1 : 2;
      grid.append(el("div", { className: "image-card" }, imageCanvas(image, palette, scale), el("div", { textContent: label }), el("div", { className: "dim", textContent: `${image.width} x ${image.height}` })));
    };
    if (pan.background) card(pan.background, "Background");
    for (let id = 0; id < 250; id++) {
      const index = pan.imageIdToIndex[id];
      if (index >= 0) card(pan.images[index], `ID ${id}`);
    }
    tab.append(grid);
  }

  private buildInstructions(): void {
    const pan = this.pan;
    const tab = byId("tab-instructions");
    tab.replaceChildren();
    this.instructionRows.clear();
    const table = el("table", { id: "instruction-list" });
    table.append(el("thead", {}, el("tr", {}, el("th", { textContent: "Offset" }), el("th", { textContent: "Bytes" }), el("th", { textContent: "Instruction" }), el("th", { textContent: "Operand" }), el("th", { textContent: "Folded arguments" }))));
    const body = el("tbody");
    pan.instructions.forEach((ins, i) => {
      const row = el("tr");
      row.dataset.offset = String(ins.offset);
      row.append(cell(hex(ins.offset), pan.jumpTargets.has(ins.offset) ? "label" : "dim"), cell(bytesText(pan.data, ins.offset, ins.length), "dim"), cell(opName(ins.opcode)));
      const operand = el("td");
      if (ins.opcode === Op.Jump || ins.opcode === Op.ConditionalJump || ins.opcode === Op.Call) operand.append(jumpLink(ins.value & 0xffff, "instruction-list"));
      else operand.textContent = instructionOperand(ins);
      row.append(operand);
      const hint = el("td", { className: "dim" });
      if (ins.opcode === Op.SetupSprite) {
        const text = instructionHint(pan, i);
        const match = /steps (0x[0-9a-f]+)$/.exec(text);
        if (match) {
          hint.append(text.slice(0, match.index + 6), jumpLink(parseInt(match[1], 16), "step-list"));
        } else hint.textContent = text;
      } else hint.textContent = instructionHint(pan, i);
      row.append(hint);
      body.append(row);
      this.instructionRows.set(ins.offset, row);
    });
    table.append(body);
    tab.append(table);
  }

  private buildSteps(): void {
    const pan = this.pan;
    const tab = byId("tab-steps");
    tab.replaceChildren();
    this.stepRows.clear();
    this.stepSpriteCells.clear();
    const table = el("table", { id: "step-list" });
    table.append(el("thead", {}, el("tr", {}, el("th", { textContent: "Offset" }), el("th", { textContent: "Bytes" }), el("th", { textContent: "Step" }), el("th", { textContent: "Operand" }), el("th", { textContent: "Sequence" }), el("th", { textContent: "Sprites here" }))));
    const body = el("tbody");
    for (const step of pan.steps) {
      const row = el("tr");
      row.dataset.offset = String(step.offset);
      const starts = pan.stepStarts.get(step.offset);
      row.append(cell(hex(step.offset), starts || pan.stepTargets.has(step.offset) ? "label" : "dim"), cell(bytesText(pan.data, step.offset, step.length), "dim"), cell(stepName(step.type)));
      const operand = el("td");
      if (step.type === 0x06) operand.append(jumpLink(step.a, "step-list"));
      else operand.textContent = stepOperand(step);
      row.append(operand);
      row.append(cell(starts ? `start for sprite${starts.length === 1 ? "" : "s"} ${starts.join(", ")}` : "", "dim"));
      const sprites = cell("");
      row.append(sprites);
      body.append(row);
      this.stepRows.set(step.offset, row);
      this.stepSpriteCells.set(step.offset, sprites);
    }
    table.append(body);
    tab.append(table);
  }

  update(): void {
    const engine = this.player.engine;
    for (const row of this.ranInstructions) row.classList.remove("ran");
    this.ranInstructions = [];
    this.ipRow?.classList.remove("ip");
    for (const offset of engine.lastInstructions) {
      const row = this.instructionRows.get(offset);
      if (row) {
        row.classList.add("ran");
        this.ranInstructions.push(row);
      }
    }
    this.ipRow = this.instructionRows.get(engine.ip) ?? null;
    this.ipRow?.classList.add("ip");

    for (const row of this.ranSteps) row.classList.remove("ran");
    this.ranSteps = [];
    for (const row of this.stepRowsHit) row.classList.remove("ip");
    this.stepRowsHit = [];
    for (const cellNode of this.stepSpriteCells.values()) cellNode.textContent = "";
    for (let i = 1; i <= MAX_SPRITES; i++) {
      const sprite = engine.sprites[i];
      if (!sprite.active) continue;
      const cellNode = this.stepSpriteCells.get(sprite.step);
      if (cellNode) cellNode.textContent += (cellNode.textContent ? ", " : "") + i;
      const row = this.stepRows.get(sprite.step);
      if (row) {
        row.classList.add("ip");
        this.stepRowsHit.push(row);
      }
    }
    const selected = engine.sprites[this.selectedSprite];
    if (selected && selected.exists) {
      for (const offset of selected.lastSteps) {
        const row = this.stepRows.get(offset);
        if (row) {
          row.classList.add("ran");
          this.ranSteps.push(row);
        }
      }
    }

    this.updateSprites(engine);
    this.updateState(engine);
    this.updateWarnings(engine);
  }

  private updateSprites(engine: Engine): void {
    const tab = byId("tab-sprites");
    const table = el("table");
    table.append(el("thead", {}, el("tr", {}, ...["Slot", "Active", "Image", "Position", "Own pos", "Follow", "Step", "Speed", "Credit", "Rate", "Flags", "Counters", "Steps this frame"].map((t) => el("th", { textContent: t })))));
    const body = el("tbody");
    let any = false;
    for (let i = 1; i <= MAX_SPRITES; i++) {
      const sprite = engine.sprites[i];
      if (!sprite.exists) continue;
      any = true;
      const pos = engine.spritePosition(sprite);
      const image = engine.image(sprite);
      const row = el("tr", { className: "selectable" + (i === this.selectedSprite ? " selected" : "") });
      row.append(
        cell(String(i)),
        cell(sprite.active ? "yes" : "no", sprite.active ? "" : "dim"),
        cell(sprite.imageId < 0 ? "hidden" : image ? `${sprite.imageId} (${image.width}x${image.height})` : `${sprite.imageId} missing`),
        cell(pos ? `${pos.x}, ${pos.y}` : "undefined"),
        cell(`${sprite.x}, ${sprite.y}`, "dim"),
        cell(sprite.followIndex === -1 ? "-" : String(sprite.followIndex)),
        cell(hex(sprite.step)),
        cell(String(sprite.speed)),
        cell(String(sprite.credit)),
        cell(String(sprite.rate)),
        cell(String(sprite.flags)),
        cell(sprite.counters.join(" ") || "-", "dim"),
        cell(sprite.lastSteps.map((s) => hex(s)).join(" "), "dim"),
      );
      row.onclick = () => {
        this.selectedSprite = this.selectedSprite === i ? 0 : i;
        this.update();
        this.onSelectSprite();
      };
      body.append(row);
    }
    table.append(body);
    tab.replaceChildren(any ? table : el("div", { className: "muted", textContent: "No sprites have been set up yet" }));
  }

  private updateState(engine: Engine): void {
    const tab = byId("tab-state");
    const dl = el("dl");
    const add = (k: string, v: string) => dl.append(el("dt", { textContent: k }), el("dd", { textContent: v }));
    add("Frame", String(engine.currentFrame));
    add("Instruction pointer", hex(engine.ip) + (engine.endReached ? " (VM ended)" : ""));
    add("Waiting", engine.waiting ? `${engine.framesToWait} more frame${engine.framesToWait === 1 ? "" : "s"}` : "no");
    add("Animation ended", engine.ended ? "yes (EndImmediate)" : "no");
    add("Stack", engine.stack.length ? engine.stack.join(" ") + "  (top is last)" : "empty");
    add("Audio this frame", engine.audio.length ? engine.audio.join(", ") : "none");
    add("Instructions this frame", engine.lastInstructions.length ? engine.lastInstructions.map((o) => hex(o)).join(" ") : "none");
    const grid = el("div", { className: "registers-grid" });
    for (let i = 0; i < MAX_REGISTERS; i++) {
      grid.append(el("span", { className: engine.registers[i] !== 0 ? "set" : "", textContent: `R${i} = ${engine.registers[i]}` }));
    }
    tab.replaceChildren(dl, el("h3", { textContent: "Registers" }), grid);
  }

  private updateWarnings(engine: Engine): void {
    const tab = byId("tab-warnings");
    const list = el("ul");
    for (const w of this.pan.warnings) list.append(el("li", { textContent: `Parser: ${w}` }));
    for (const w of engine.warnings) list.append(el("li", { textContent: w }));
    tab.replaceChildren(list.childElementCount ? list : el("div", { className: "muted", textContent: "No warnings" }));
    const tabButton = document.querySelector<HTMLElement>('#tabs [data-tab="warnings"]');
    if (tabButton) tabButton.textContent = list.childElementCount ? `Warnings (${list.childElementCount})` : "Warnings";
  }
}
