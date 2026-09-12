import { hex } from "./disasm";
import { toRgba } from "./palette";
import { Op, PanFile, parsePan } from "./pan";
import { Player } from "./player";
import { DebugView, byId, el } from "./ui";

let player: Player | null = null;
let view: DebugView | null = null;
let imageData: ImageData | null = null;

const screen = byId<HTMLCanvasElement>("screen");
const overlay = byId<HTMLCanvasElement>("overlay");
const scrub = byId<HTMLInputElement>("scrub");
const frameLabel = byId("frame-label");
const playButton = byId<HTMLButtonElement>("play");
const status = byId("status");
const transparent = byId<HTMLInputElement>("transparent");
const zoom = byId<HTMLSelectElement>("zoom");
const speed = byId<HTMLSelectElement>("speed");
const maxFrames = byId<HTMLInputElement>("max-frames");
const inputsBody = byId<HTMLTableSectionElement>("inputs").querySelector("tbody") as HTMLTableSectionElement;

function applyZoom(): void {
  if (!player) return;
  const wrap = byId("screen-wrap");
  const fit = zoom.value === "fit";
  wrap.classList.toggle("fit", fit);
  const scale = fit ? 1 : Number(zoom.value);
  for (const canvas of [screen, overlay]) {
    canvas.style.width = fit ? "100%" : `${player.pan.width * scale}px`;
    canvas.style.height = fit ? "auto" : `${player.pan.height * scale}px`;
  }
}

function render(): void {
  if (!player || !view) return;
  const engine = player.engine;
  const ctx = screen.getContext("2d") as CanvasRenderingContext2D;
  if (!imageData || imageData.width !== engine.width || imageData.height !== engine.height) {
    imageData = ctx.createImageData(engine.width, engine.height);
  }
  toRgba(engine.frame, engine.palette, imageData.data, transparent.checked);
  ctx.putImageData(imageData, 0, 0);

  const octx = overlay.getContext("2d") as CanvasRenderingContext2D;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const sprite = engine.sprites[view.selectedSprite];
  if (sprite && sprite.exists && sprite.active) {
    const pos = engine.spritePosition(sprite);
    const image = engine.image(sprite);
    if (pos) {
      const w = image ? image.width : 4;
      const h = image ? image.height : 4;
      octx.strokeStyle = "#ff00c8";
      octx.lineWidth = 1;
      octx.strokeRect(pos.x - 1.5, pos.y - 1.5, w + 2, h + 2);
    }
  }

  scrub.max = String(player.lastFrame);
  scrub.value = String(player.frame);
  frameLabel.textContent = `${player.frame} / ${player.lastFrame}`;
  const parts = [`ip ${hex(engine.ip)}`];
  if (engine.waiting) parts.push(`wait ${engine.framesToWait}`);
  if (engine.endReached) parts.push(engine.ended ? "ended (EndImmediate)" : "VM ended, sprites still run");
  if (engine.audio.length) parts.push(`audio ${engine.audio.join(",")}`);
  const active = engine.sprites.filter((s) => s.active).length;
  parts.push(`${active} active sprite${active === 1 ? "" : "s"}`);
  if (engine.warnings.length) parts.push(`${engine.warnings.length} warning${engine.warnings.length === 1 ? "" : "s"}`);
  status.textContent = parts.join("  |  ");
  view.update();
}

function updatePlayButton(): void {
  playButton.innerHTML = player?.playing ? "&#10074;&#10074;" : "&#9654;";
}

function usedRegisters(pan: PanFile): number[] {
  const set = new Set<number>();
  for (const ins of pan.instructions) {
    if ((ins.opcode === Op.Push && ins.sub !== 0) || ins.opcode === Op.PopToRegister) {
      if (ins.value >= 0 && ins.value <= 50) set.add(ins.value);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function buildInputs(): void {
  if (!player) return;
  const p = player;
  const registers = new Set(usedRegisters(p.pan));
  for (const r of p.inputs.keys()) registers.add(r);
  inputsBody.replaceChildren();
  for (const register of [...registers].sort((a, b) => a - b)) {
    const input = p.inputs.get(register) ?? { value: 0, frame: 0 };
    const value = el("input", { type: "number", value: String(input.value), min: "-32768", max: "32767" });
    const frame = el("input", { type: "number", value: String(input.frame), min: "0" });
    const commit = () => p.setInput(register, Number(value.value) || 0, Math.max(0, Number(frame.value) || 0));
    value.onchange = () => {
      commit();
      render();
    };
    frame.onchange = () => {
      commit();
      render();
    };
    const now = el("button", { type: "button", textContent: "now", title: "Apply at the current frame" });
    now.onclick = () => {
      frame.value = String(p.frame);
      commit();
      render();
    };
    inputsBody.append(el("tr", {}, el("td", { textContent: `R${register}` }), el("td", {}, value), el("td", {}, frame), el("td", {}, now)));
  }
}

function load(name: string, bytes: Uint8Array): void {
  player?.pause();
  try {
    const pan = parsePan(name, bytes);
    player = new Player(pan);
  } catch (e) {
    alert(`Could not load ${name}: ${(e as Error).message}`);
    return;
  }
  player.speed = Number(speed.value);
  player.maxFrames = Number(maxFrames.value) || 500;
  player.reset();
  player.onFrame = render;
  player.onPlayState = updatePlayButton;
  view = new DebugView(player);
  view.onSelectSprite = render;
  screen.width = overlay.width = pan(player).width;
  screen.height = overlay.height = pan(player).height;
  imageData = null;
  applyZoom();
  byId("file-name").textContent = name;
  byId("main").hidden = false;
  byId("empty").hidden = true;
  view.build();
  buildInputs();
  updatePlayButton();
  render();
}

function pan(p: Player): PanFile {
  return p.pan;
}

async function loadFile(file: File): Promise<void> {
  load(file.name, new Uint8Array(await file.arrayBuffer()));
}

byId<HTMLInputElement>("file").onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadFile(file);
};

document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

byId("rewind").onclick = () => player?.rewind();
byId("back").onclick = () => {
  player?.pause();
  player?.step(-1);
};
byId("forward").onclick = () => {
  player?.pause();
  player?.step(1);
};
playButton.onclick = () => player?.toggle();
scrub.oninput = () => {
  player?.pause();
  player?.seek(Number(scrub.value));
};
speed.onchange = () => {
  if (player) player.speed = Number(speed.value);
};
zoom.onchange = applyZoom;
transparent.onchange = render;
maxFrames.onchange = () => {
  player?.setMaxFrames(Number(maxFrames.value) || 500);
  render();
};
byId("add-input").onclick = () => {
  const register = Number(byId<HTMLInputElement>("add-register").value);
  if (!player || register < 0 || register > 50) return;
  if (!player.inputs.has(register)) player.inputs.set(register, { value: 0, frame: 0 });
  buildInputs();
};
byId("clear-inputs").onclick = () => {
  player?.clearInputs();
  buildInputs();
  render();
};

for (const button of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
  button.onclick = () => {
    for (const other of document.querySelectorAll<HTMLButtonElement>("#tabs button")) other.classList.toggle("active", other === button);
    for (const tab of document.querySelectorAll<HTMLElement>(".tab")) tab.hidden = tab.id !== `tab-${button.dataset.tab}`;
  };
}

const help = byId<HTMLDialogElement>("help");
byId("help-open").onclick = () => help.showModal();
byId("help-close").onclick = () => help.close();
help.onclick = (e) => {
  if (e.target === help) help.close();
};

document.addEventListener("keydown", (e) => {
  if (!player || help.open) return;
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      player.toggle();
      break;
    case "ArrowLeft":
      e.preventDefault();
      player.pause();
      player.step(-1);
      break;
    case "ArrowRight":
      e.preventDefault();
      player.pause();
      player.step(1);
      break;
    case "Home":
      e.preventDefault();
      player.rewind();
      break;
  }
});
