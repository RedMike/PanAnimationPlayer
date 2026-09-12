class BitReader {
  pos: number;
  private bit = 0;
  private cur = -1;

  constructor(private data: Uint8Array, offset: number) {
    this.pos = offset;
  }

  readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      if (this.cur < 0) {
        if (this.pos >= this.data.length) throw new Error("Unexpected end of image data");
        this.cur = this.data[this.pos++];
      }
      if (this.cur & (1 << this.bit)) value |= 1 << i;
      if (++this.bit === 8) {
        this.bit = 0;
        this.cur = -1;
      }
    }
    return value;
  }
}

class LzwReader {
  private dict = new Map<number, number[]>();
  private stack: number[] = [];
  private wordWidth = 9;
  private wordMask = 0;
  private prevIndex = 0;
  private prevData = 0;
  private nextId = 0x100;

  constructor(private bits: BitReader, private maxWordWidth: number) {
    this.reset();
  }

  private reset(): void {
    this.prevIndex = 0;
    this.prevData = 0;
    this.wordWidth = 9;
    this.wordMask = (1 << 9) - 1;
    this.dict.clear();
    this.nextId = 0x100;
  }

  private get(index: number): number[] {
    if (index > 2048) throw new Error(`LZW index beyond dictionary: ${index}`);
    let word = this.dict.get(index);
    if (word) return word;
    if (index > 0xff) throw new Error("LZW reading undefined dictionary entry");
    word = [index & 0xff];
    this.dict.set(index, word);
    return word;
  }

  next(): number {
    while (this.stack.length === 0) {
      let index = this.bits.readBits(this.wordWidth);
      const nextId = this.nextId;
      let existing: number[];
      if (index >= nextId) {
        index = nextId;
        this.stack.push(this.prevData);
        existing = this.get(this.prevIndex);
      } else {
        existing = this.get(index);
      }
      for (const b of existing) this.stack.push(b);
      const first = this.stack[this.stack.length - 1];
      this.prevData = first;
      const word = [first, ...this.get(this.prevIndex)];
      this.dict.set(nextId, word);
      this.nextId = nextId + 1;
      this.prevIndex = index;
      if (nextId >= this.wordMask) {
        this.wordWidth++;
        this.wordMask = (this.wordMask << 1) | 1;
      }
      if (this.wordWidth > this.maxWordWidth) this.reset();
    }
    return this.stack.pop()!;
  }
}

class RleReader {
  private pixel = 0;
  private count = 0;

  constructor(private inner: LzwReader) {}

  next(): number {
    if (this.count > 0) {
      this.count--;
      return this.pixel;
    }
    const b = this.inner.next();
    if (b !== 0x90) {
      this.pixel = b;
      return b;
    }
    const repeat = this.inner.next();
    if (repeat === 0) {
      this.pixel = 0x90;
      return 0x90;
    }
    if (repeat < 2) throw new Error(`Invalid RLE repeat: ${repeat}`);
    this.count = repeat - 2;
    return this.pixel;
  }
}

export function decompressPixels(
  data: Uint8Array,
  offset: number,
  width: number,
  height: number,
  maxWordWidth: number,
): { pixels: Uint8Array; end: number } {
  const bits = new BitReader(data, offset);
  const rle = new RleReader(new LzwReader(bits, maxWordWidth));
  const pixels = new Uint8Array(width * height);
  const rowBytes = (width + 1) >> 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let i = 0; i < rowBytes; i++) {
      const b = rle.next();
      const x = i * 2;
      pixels[row + x] = b & 0x0f;
      if (x + 1 < width) pixels[row + x + 1] = (b >> 4) & 0x0f;
    }
  }
  return { pixels, end: bits.pos };
}
