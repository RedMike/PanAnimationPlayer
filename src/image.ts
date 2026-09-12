import { decompressPixels } from "./lzw";

export interface PanImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function u16(data: Uint8Array, offset: number): number {
  if (offset + 1 >= data.length) throw new Error("Unexpected end of file");
  return data[offset] | (data[offset + 1] << 8);
}

export function parseImage(data: Uint8Array, offset: number, raw: boolean): { image: PanImage; end: number } {
  const start = offset;
  const formatFlag = u16(data, offset);
  const width = u16(data, offset + 2);
  const height = u16(data, offset + 4);
  offset += 6;
  let pixels: Uint8Array;
  if (raw) {
    const size = width * height;
    if (offset + size > data.length) throw new Error("Truncated raw image");
    pixels = data.slice(offset, offset + size);
    for (let i = 0; i < size; i++) pixels[i] &= 0x0f;
    offset += size;
  } else {
    if (formatFlag === 0x0f) offset += 16;
    else if (formatFlag !== 0x07) throw new Error(`Unsupported image format flag 0x${formatFlag.toString(16)}`);
    const maxWordWidth = data[offset++];
    const result = decompressPixels(data, offset, width, height, maxWordWidth);
    pixels = result.pixels;
    offset = result.end;
  }
  if ((offset - start) % 2 === 1) offset++;
  return { image: { width, height, pixels }, end: offset };
}
