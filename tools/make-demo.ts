import { writeFileSync } from "node:fs";

const WIDTH = 160;
const HEIGHT = 100;
const MAX_WORD_WIDTH = 11;

interface Image {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function image(width: number, height: number, fill = 0): Image {
  return { width, height, pixels: new Uint8Array(width * height).fill(fill) };
}

function plot(img: Image, x: number, y: number, c: number): void {
  if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.pixels[y * img.width + x] = c;
}

function rect(img: Image, x: number, y: number, w: number, h: number, c: number): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) plot(img, px, py, c);
}

function ellipse(img: Image, cx: number, cy: number, rx: number, ry: number, c: number): void {
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      const dx = (px + 0.5 - cx) / rx;
      const dy = (py + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) plot(img, px, py, c);
    }
  }
}

function fromArt(rows: string[], colours: Record<string, number>): Image {
  const img = image(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => plot(img, x, y, ch === "." ? 0 : colours[ch])));
  return img;
}

function background(): Image {
  const img = image(WIDTH, HEIGHT, 9);
  rect(img, 0, 66, WIDTH, HEIGHT - 66, 2);
  rect(img, 0, 66, WIDTH, 1, 10);
  rect(img, 0, 84, WIDTH, 10, 8);
  for (let x = 4; x < WIDTH; x += 16) rect(img, x, 88, 8, 2, 14);
  ellipse(img, 138, 18, 9, 9, 14);
  ellipse(img, 138, 18, 6, 6, 15);
  for (const [cx, cy, r] of [[30, 20, 8], [40, 18, 10], [52, 22, 7], [96, 30, 6], [104, 28, 8], [113, 31, 5]]) ellipse(img, cx, cy, r, r * 0.6, 15);
  rect(img, 10, 40, 34, 26, 6);
  rect(img, 12, 42, 30, 22, 12);
  for (let i = 0; i < 8; i++) rect(img, 6 + i * 2, 40 - i, 42 - i * 4, 1, 4);
  rect(img, 30, 26, 4, 8, 8);
  rect(img, 24, 52, 8, 14, 0);
  rect(img, 30, 58, 1, 1, 14);
  rect(img, 14, 46, 7, 7, 11);
  rect(img, 17, 46, 1, 7, 15);
  rect(img, 14, 49, 7, 1, 15);
  rect(img, 34, 46, 7, 7, 11);
  rect(img, 37, 46, 1, 7, 15);
  rect(img, 34, 49, 7, 1, 15);
  rect(img, 60, 50, 4, 16, 6);
  ellipse(img, 62, 44, 9, 9, 2);
  ellipse(img, 62, 44, 6, 6, 10);
  return img;
}

function ball(height: number): Image {
  const img = image(12, height);
  ellipse(img, 6, height / 2, 6, height / 2, 12);
  ellipse(img, 4, height / 3, 1.6, 1.2, 15);
  return img;
}

function walker(suit: number, frame: number): Image {
  const head = ["...HHHH...", "..HHHHHH..", "..HKHHKH..", "..HHHHHH..", "...HHHH...", "....HH...."];
  const body = ["..BBBBBB..", ".BBBBBBBB.", "BB.BBBB.BB", "BB.BBBB.BB", "S..BBBB..S", "...BBBB...", "...BBBB..."];
  const legs = [
    ["...BB.BB..", "..BB...BB.", "..BB...BB.", ".BB.....BB", ".KK.....KK", "KKK.....KKK"],
    ["....BBB...", "....BBB...", "....BBB...", "....BBB...", "....KKK...", "...KKKK..."],
    ["..BB.BB...", ".BB...BB..", ".BB...BB..", "BB.....BB.", "KK.....KK.", "KKK.....KKK"],
    ["...BBBB...", "...BB.BB..", "...BB.BB..", "...BB.BB..", "...KK.KK..", "..KKK.KKK."],
  ];
  const rows = [...head, ...body, ...legs[frame]].map((r) => r.padEnd(11, ".").slice(0, 11));
  return fromArt(rows, { H: 7, K: 0, B: suit, S: 7 });
}

function balloon(): Image {
  const img = image(7, 11);
  ellipse(img, 3.5, 3.5, 3.5, 3.8, 13);
  plot(img, 2, 2, 15);
  rect(img, 3, 8, 1, 3, 8);
  return img;
}

function lamp(on: boolean): Image {
  const img = image(7, 7);
  ellipse(img, 3.5, 3.5, 3.5, 3.5, on ? 14 : 6);
  if (on) plot(img, 2, 2, 15);
  return img;
}

function post(): Image {
  const img = image(3, 22);
  rect(img, 0, 0, 3, 22, 8);
  rect(img, 1, 0, 1, 22, 7);
  return img;
}

function footprint(): Image {
  return fromArt(["FFF.", ".FFF"], { F: 8 });
}

function packPixels(img: Image): number[] {
  const out: number[] = [];
  const rowBytes = (img.width + 1) >> 1;
  for (let y = 0; y < img.height; y++) {
    for (let i = 0; i < rowBytes; i++) {
      const x = i * 2;
      const low = img.pixels[y * img.width + x] & 0x0f;
      const high = x + 1 < img.width ? img.pixels[y * img.width + x + 1] & 0x0f : 0;
      out.push(low | (high << 4));
    }
  }
  return out;
}

function rleEncode(bytes: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === b && run < 255) run++;
    if (b === 0x90) out.push(0x90, 0x00);
    else out.push(b);
    if (run >= 3) out.push(0x90, run);
    else if (run === 2) out.push(...(b === 0x90 ? [0x90, 0x00] : [b]));
    i += run;
  }
  return out;
}

function lzwEncode(input: number[], maxWidth: number): number[] {
  const out: number[] = [];
  let cur = 0;
  let bits = 0;
  const emit = (code: number, width: number) => {
    cur |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  let dict = new Map<string, number>();
  let nextId = 0x100;
  let width = 9;
  let mask = (1 << 9) - 1;
  let prevWord: number[] = [0];
  let i = 0;
  while (i < input.length) {
    const word = [input[i]];
    let code = input[i];
    let j = i + 1;
    while (j < input.length) {
      const found = dict.get([...word, input[j]].join(","));
      if (found === undefined) break;
      word.push(input[j]);
      code = found;
      j++;
    }
    emit(code, width);
    const id = nextId++;
    dict.set([...prevWord, word[0]].join(","), id);
    prevWord = word;
    if (id >= mask) {
      width++;
      mask = (mask << 1) | 1;
    }
    if (width > maxWidth) {
      dict = new Map();
      nextId = 0x100;
      width = 9;
      mask = (1 << 9) - 1;
      prevWord = [0];
    }
    i = j;
  }
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function encodeImage(img: Image): number[] {
  const data = lzwEncode(rleEncode(packPixels(img)), MAX_WORD_WIDTH);
  const bytes = [...u16(0x07), ...u16(img.width), ...u16(img.height), MAX_WORD_WIDTH, ...data];
  if (bytes.length % 2 === 1) bytes.push(0);
  return bytes;
}

type Fixup = { at: number; label: string };

class Assembler {
  bytes: number[] = [];
  labels = new Map<string, number>();
  fixups: Fixup[] = [];

  label(name: string): this {
    this.labels.set(name, this.bytes.length);
    return this;
  }

  raw(...values: number[]): this {
    this.bytes.push(...values);
    return this;
  }

  ref(label: string): this {
    this.fixups.push({ at: this.bytes.length, label });
    this.bytes.push(0, 0);
    return this;
  }

  push(value: number): this {
    return this.raw(0x05, 0x00, ...u16(value));
  }

  pushReg(register: number): this {
    return this.raw(0x05, 0x01, ...u16(register));
  }

  pushRef(label: string): this {
    return this.raw(0x05, 0x00).ref(label);
  }

  setupSprite(steps: string, slot: number, follow: number, x: number, y: number, rate: number, flags: number): this {
    return this.pushRef(steps).push(slot).push(follow).push(x).push(y).push(rate).push(flags).raw(0x00);
  }

  resolve(): number[] {
    for (const { at, label } of this.fixups) {
      const target = this.labels.get(label);
      if (target === undefined) throw new Error(`Unknown label ${label}`);
      this.bytes[at] = target & 0xff;
      this.bytes[at + 1] = target >> 8;
    }
    return this.bytes;
  }
}

function program(): number[] {
  const a = new Assembler();
  a.setupSprite("post", 2, -1, 138, 44, 255, 1);
  a.setupSprite("lamp", 3, -1, 136, 38, 128, 0);
  a.setupSprite("ball", 1, -1, 70, 8, 255, 0);
  a.pushReg(0).push(1).raw(0x08).raw(0x12).ref("walkerB");
  a.pushReg(0).push(2).raw(0x08).raw(0x12).ref("walkerC");
  a.setupSprite("walkA", 5, -1, -12, 62, 255, 0).raw(0x13).ref("walkerDone");
  a.label("walkerB").setupSprite("walkB", 5, -1, -12, 62, 255, 0).raw(0x13).ref("walkerDone");
  a.label("walkerC").setupSprite("walkC", 5, -1, -12, 62, 255, 0);
  a.label("walkerDone");
  a.setupSprite("balloon", 6, 5, 9, -12, 255, 0);
  a.push(12).raw(0x02);
  a.push(1).raw(0x03);
  a.push(7).raw(0x06, ...u16(1));
  a.label("stampLoop").pushReg(1).raw(0x12).ref("stampBody").raw(0x13).ref("stampDone");
  a.label("stampBody");
  a.setupSprite("print", 7, 5, 1, 18, 255, 0);
  a.push(7).raw(0x04);
  a.push(8).raw(0x02);
  a.push(7).raw(0x01);
  a.pushReg(1).push(1).raw(0x0f).raw(0x06, ...u16(1));
  a.raw(0x13).ref("stampLoop");
  a.label("stampDone");
  a.push(40).raw(0x02);
  a.push(1).raw(0x01);
  a.raw(0x14);

  const draw = (id: number) => a.raw(0x00, id);
  const move = (dx: number, dy: number) => a.raw(0x02, ...u16(dx), ...u16(dy));

  a.label("post").raw(0x00, 52).raw(0x09);
  a.label("lamp").raw(0x05, ...u16(6)).label("lampOn").raw(0x00, 50).raw(0x06).ref("lampOn");
  a.raw(0x05, ...u16(4)).label("lampOff").raw(0x00, 51).raw(0x06).ref("lampOff").raw(0x08);

  a.label("ball").raw(0x05, ...u16(10)).label("bounce");
  a.raw(0x05, ...u16(9)).label("ballDown");
  move(1, 5);
  draw(0);
  a.raw(0x06).ref("ballDown");
  move(0, 2);
  draw(1);
  move(0, 2);
  draw(2);
  move(0, -2);
  draw(1);
  move(0, -2);
  a.raw(0x05, ...u16(9)).label("ballUp");
  move(0, -5);
  draw(0);
  a.raw(0x06).ref("ballUp");
  a.raw(0x06).ref("bounce");
  a.raw(0x07);

  for (const [name, base] of [["walkA", 10], ["walkB", 20], ["walkC", 30]] as [string, number][]) {
    a.label(name).raw(0x05, ...u16(17)).label(`${name}Loop`);
    for (const frame of [0, 1, 2, 1]) {
      draw(base + frame);
      move(2, 0);
    }
    a.raw(0x06).ref(`${name}Loop`);
    draw(base + 3);
    a.raw(0x09);
  }

  a.label("balloon");
  for (const dy of [-1, -1, 0, 1, 1, 0]) {
    move(0, dy);
    draw(40);
  }
  a.raw(0x08);

  a.label("print").raw(0x00, 60).raw(0x09);
  return a.resolve();
}

function build(): Uint8Array {
  const images = new Map<number, Image>([
    [0, ball(12)],
    [1, ball(10)],
    [2, ball(8)],
    [10, walker(1, 0)],
    [11, walker(1, 1)],
    [12, walker(1, 2)],
    [13, walker(1, 3)],
    [20, walker(4, 0)],
    [21, walker(4, 1)],
    [22, walker(4, 2)],
    [23, walker(4, 3)],
    [30, walker(10, 0)],
    [31, walker(10, 1)],
    [32, walker(10, 2)],
    [33, walker(10, 3)],
    [40, balloon()],
    [50, lamp(true)],
    [51, lamp(false)],
    [52, post()],
    [60, footprint()],
  ]);
  const out: number[] = [0x50, 0x41, 0x4e, 0x49, 0x03, 0x01, 0x01, 0x00];
  out.push(3, 1, 2, 3, 4, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0);
  out.push(...u16(0), ...u16(0), ...u16(WIDTH - 1), ...u16(HEIGHT - 1), ...u16(2), 0x01);
  out.push(...encodeImage(background()));
  for (let id = 0; id < 250; id++) out.push(...u16(images.has(id) ? 0x0100 + id : 0));
  for (const [, img] of [...images.entries()].sort((x, y) => x[0] - y[0])) out.push(...encodeImage(img));
  const data = program();
  while (data.length % 16 !== 0) data.push(0);
  out.push(...u16(data.length / 16), ...data);
  return Uint8Array.from(out);
}

const bytes = build();
writeFileSync(process.argv[2] ?? "demo.pan", bytes);
console.log(`wrote ${bytes.length} bytes`);
