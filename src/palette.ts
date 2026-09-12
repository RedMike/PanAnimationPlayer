export const VGA_COLORS: [number, number, number][] = [
  [0x00, 0x00, 0x00],
  [0x00, 0x00, 0xaa],
  [0x00, 0xaa, 0x00],
  [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00],
  [0xaa, 0x00, 0xaa],
  [0xaa, 0x55, 0x00],
  [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55],
  [0x55, 0x55, 0xff],
  [0x55, 0xff, 0x55],
  [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55],
  [0xff, 0x55, 0xff],
  [0xff, 0xff, 0x55],
  [0xff, 0xff, 0xff],
];

export const COLOR_NAMES = [
  "black",
  "blue",
  "green",
  "cyan",
  "red",
  "magenta",
  "brown",
  "light grey",
  "dark grey",
  "light blue",
  "light green",
  "light cyan",
  "light red",
  "light magenta",
  "yellow",
  "white",
];

export function toRgba(page: Uint8Array, palette: Uint8Array | null, out: Uint8ClampedArray, transparentZero: boolean): void {
  for (let i = 0; i < page.length; i++) {
    const index = page[i] & 0x0f;
    const o = i * 4;
    if (index === 0 && transparentZero) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    const shown = palette ? palette[index] : index;
    const [r, g, b] = VGA_COLORS[shown];
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
}

export function cssColor(index: number): string {
  const [r, g, b] = VGA_COLORS[index & 0x0f];
  return `rgb(${r},${g},${b})`;
}
