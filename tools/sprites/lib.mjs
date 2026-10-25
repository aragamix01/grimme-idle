// Pixel grid + PNG encoder. Art is authored as rows of palette characters ('.' = transparent).
import { deflateSync } from 'node:zlib';

export class Grid {
  constructor(w, h, fill = '.') {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(fill);
  }

  static from(rows, name = 'grid') {
    const w = rows[0].length;
    rows.forEach((row, y) => {
      if (row.length !== w) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${w}: "${row}"`);
    });
    return new Grid(w, rows.length).stamp(rows);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.px[y * this.w + x];
  }

  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    return this;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  hline(x, y, w, c) {
    return this.rect(x, y, w, 1, c);
  }

  vline(x, y, h, c) {
    return this.rect(x, y, 1, h, c);
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    return this;
  }

  disc(cx, cy, r, c) {
    return this.ellipse(cx, cy, r, r, c);
  }

  // Isoceles triangle pointing up, apex at (cx, top).
  tri(cx, top, halfW, h, c) {
    for (let j = 0; j < h; j++) {
      const hw = Math.round((halfW * (j + 1)) / h);
      this.hline(Math.round(cx - hw), top + j, hw * 2, c);
    }
    return this;
  }

  // Overlay rows; '.' keeps what is underneath, '_' erases to transparent.
  stamp(rows, ox = 0, oy = 0) {
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        this.set(ox + i, oy + j, ch === '_' ? '.' : ch);
      }),
    );
    return this;
  }

  layer(grid, ox = 0, oy = 0) {
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        const c = grid.get(x, y);
        if (c !== '.') this.set(ox + x, oy + y, c);
      }
    return this;
  }

  remap(map) {
    this.px = this.px.map((c) => map[c] ?? c);
    return this;
  }

  clone() {
    const g = new Grid(this.w, this.h);
    g.px = [...this.px];
    return g;
  }

  shift(dx, dy) {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(x + dx, y + dy, this.get(x, y));
    this.px = g.px;
    return this;
  }

  flipX() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(this.w - 1 - x, y, this.get(x, y));
    this.px = g.px;
    return this;
  }

  // Darken pixels on the bottom/right silhouette edge (light comes from top-left).
  shade(map) {
    const src = this.clone();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = src.get(x, y);
        if (c === '.' || !map[c]) continue;
        if (src.get(x + 1, y) === '.' || src.get(x, y + 1) === '.') this.set(x, y, map[c]);
      }
    return this;
  }

  // 1px outline around the silhouette; 4-neighbour keeps corners soft like hand-drawn sprites.
  // exteriorOnly skips enclosed holes (letter counters) so thick logo strokes stay readable.
  outline(c = 'o', diagonal = false, exteriorOnly = false) {
    const src = this.clone();
    const outside = exteriorOnly ? src.exterior() : null;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src.get(x, y) !== '.') continue;
        if (outside && !outside[y * this.w + x]) continue;
        const n = [src.get(x - 1, y), src.get(x + 1, y), src.get(x, y - 1), src.get(x, y + 1)];
        if (diagonal) n.push(src.get(x - 1, y - 1), src.get(x + 1, y - 1), src.get(x - 1, y + 1), src.get(x + 1, y + 1));
        if (n.some((v) => v !== '.')) this.set(x, y, c);
      }
    return this;
  }

  // Transparent pixels reachable from the canvas edge.
  exterior() {
    const seen = new Uint8Array(this.w * this.h);
    const stack = [];
    for (let x = 0; x < this.w; x++) stack.push([x, 0], [x, this.h - 1]);
    for (let y = 0; y < this.h; y++) stack.push([0, y], [this.w - 1, y]);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      if (seen[i] || this.px[i] !== '.') continue;
      seen[i] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return seen;
  }
}

export function sheet(frames) {
  const { w, h } = frames[0];
  const g = new Grid(w * frames.length, h);
  frames.forEach((f, i) => g.layer(f, i * w, 0));
  return g;
}

// ---- PNG ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function hexToRgba(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255];
}

export function toPng(grid, palette, scale = 1) {
  const w = grid.w * scale;
  const h = grid.h * scale;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = grid.get(Math.floor(x / scale), Math.floor(y / scale));
      if (c === '.') continue;
      const hex = palette[c];
      if (!hex) throw new Error(`No palette colour for "${c}"`);
      const [r, g, b, a] = hexToRgba(hex);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Tiny seeded RNG so procedural tiles are identical on every build.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
