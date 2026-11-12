// Procedural textures, ported from the Wisteria prototype
// (Wisteria/src/textures.js). Everything is drawn on a canvas at start-up, so
// the viewer ships no image files.
import * as THREE from 'three';
import type { LeafTexture } from './plant/look.ts';
import { RNG } from './util.ts';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas is not available');
  return g;
}

function tex(c: HTMLCanvasElement, { srgb = true, repeat = true }: { srgb?: boolean; repeat?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export interface TexturePair {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

interface StreakOptions {
  base: string;
  dark: string;
  light: string;
  count: number;
  width: number;
  wobble: number;
}

// Tileable fibrous streaks running along V - used for bark and timber.
function streaks(size: number, rng: RNG, { base, dark, light, count, width, wobble }: StreakOptions): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = ctx2d(c);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const x0 = rng.range(0, size);
    const k1 = rng.int(1, 3);
    const k2 = rng.int(2, 6);
    const p1 = rng.range(0, 6.28);
    const p2 = rng.range(0, 6.28);
    const a = rng.range(0.3, 1) * wobble;
    const isDark = rng.chance(0.6);
    g.strokeStyle = isDark ? dark : light;
    g.globalAlpha = rng.range(0.05, isDark ? 0.5 : 0.3);
    g.lineWidth = rng.range(0.6, width);
    // partial-length fissures that still tile vertically
    const y0 = rng.range(0, size);
    const len = rng.range(0.25, 1) * size;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0]) {
        g.beginPath();
        for (let y = 0; y <= len; y += 6) {
          const yy = y0 + y;
          const ph = (yy / size) * Math.PI * 2;
          const x = x0 + a * (Math.sin(ph * k1 + p1) * 0.7 + Math.sin(ph * k2 + p2) * 0.3);
          if (y === 0) g.moveTo(x + ox, yy + oy);
          else g.lineTo(x + ox, yy + oy);
        }
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}

/** The grain of a bark: how many streaks, how wide (pixels of 512), and how far they wander. */
export interface BarkGrain {
  streaks: number;
  width: number;
  wobble: number;
}
/** The fissured bark the prototype drew for wisteria, and the default for a taxon that states no grain. */
export const FISSURED: BarkGrain = { streaks: 520, width: 3.2, wobble: 16 };

export function makeBarkTextures(grain: BarkGrain = FISSURED): TexturePair {
  const o = { count: grain.streaks, width: grain.width, wobble: grain.wobble };
  const map = streaks(512, new RNG(11), { base: '#9c958b', dark: '#2c2723', light: '#d9d3ca', ...o });
  const bump = streaks(512, new RNG(11), { base: '#909090', dark: '#000000', light: '#ffffff', ...o });
  return { map: tex(map), bump: tex(bump, { srgb: false }) };
}

// Leaflet texture: light tint map (multiplied by per-instance colour) with a
// pale midrib and pinnate secondary veins. U spans the blade width at every V.
export function makeLeafTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const c = canvas(W, H);
  const g = ctx2d(c);
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#d2d2d2');
  grd.addColorStop(0.5, '#f2f2f2');
  grd.addColorStop(1, '#d2d2d2');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // canvas y=0 is the top; flipY makes v=1 (leaf tip) the top row
  g.strokeStyle = '#ffffff';
  g.globalAlpha = 0.55;
  g.lineWidth = 1.6;
  for (let i = 0; i < 11; i++) {
    const y = H - 14 - i * 21;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * 30, y - 12, W / 2 + s * 64, y - 34);
      g.stroke();
    }
  }
  g.globalAlpha = 0.25;
  g.strokeStyle = '#6b6b6b';
  g.lineWidth = 3;
  for (let i = 0; i < 11; i++) {
    const y = H - 4 - i * 21;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * 30, y - 12, W / 2 + s * 64, y - 34);
      g.stroke();
    }
  }
  g.globalAlpha = 0.9;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(W / 2, H);
  g.lineTo(W / 2, 0);
  g.stroke();
  return tex(c, { repeat: false });
}

/**
 * A leaf texture of a taxon's own (LeafTexture in plant/look.ts): its colour and its relief, painted by the look on
 * two square canvases. The colour is read as sRGB like the shared texture; the relief is data.
 */
export function makeOwnLeafTexture(texture: LeafTexture): TexturePair {
  const map = canvas(texture.size, texture.size);
  const bump = canvas(texture.size, texture.size);
  texture.paint(ctx2d(map), ctx2d(bump), texture.size);
  return { map: tex(map, { repeat: false }), bump: tex(bump, { srgb: false, repeat: false }) };
}

export function makeGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = canvas(S, S);
  const g = ctx2d(c);
  const rng = new RNG(3);
  g.fillStyle = '#5a7040';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const l = rng.range(3, 9);
    const a = rng.range(-0.5, 0.5);
    g.strokeStyle = rng.pick(['#4d6636', '#6a8448', '#778f52', '#435930', '#84965a', '#8a9160']);
    g.globalAlpha = rng.range(0.25, 0.7);
    g.lineWidth = 1;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.sin(a) * l, y + oy - Math.cos(a) * l);
        g.stroke();
      }
    }
  }
  return tex(c);
}

// Glulam: bands across U are the laminations (glue lines between them),
// grain runs along V. One band = 1/8 of the texture width. Each lamination is
// its own board: its own tone, its own figure (straight, or the arches of a
// flat-sawn face), now and then a small tight knot, and somewhere along it a
// finger joint where two lengths were glued end to end.
export function makeGlulamTextures(): TexturePair {
  const S = 1024;
  const BAND = S / 8;
  const rng = new RNG(21);
  const o = { count: 1500, width: 1.7, wobble: 5 };
  const c = streaks(S, rng, { base: '#d8ba8b', dark: '#9a7245', light: '#efdcb8', ...o });
  const b = streaks(S, new RNG(21), { base: '#a8a8a8', dark: '#3a3a3a', light: '#e8e8e8', ...o });
  const g = ctx2d(c);
  const gb = ctx2d(b);
  const tones = ['#e3c99c', '#c9a672', '#dcc08e', '#d2b07e', '#e8d2a8', '#c4a06c', '#d9bb88', '#ceac7a'];
  for (let i = 0; i < 8; i++) {
    const x0 = i * BAND;
    // the board's own tone
    g.globalAlpha = rng.range(0.28, 0.5);
    g.fillStyle = tones[i]!;
    g.fillRect(x0, 0, BAND, S);
    g.save();
    g.beginPath();
    g.rect(x0, 0, BAND, S);
    g.clip();
    // flat-sawn boards show their growth rings as long arches; the others stay straight-grained
    if (rng.chance(0.55)) {
      const cx = x0 + rng.range(0.25, 0.75) * BAND;
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        const cy = rng.range(0, S);
        const rings = rng.int(5, 9);
        for (let r = 1; r <= rings; r++) {
          g.globalAlpha = rng.range(0.1, 0.24);
          g.strokeStyle = rng.chance(0.75) ? '#8a6238' : '#f2e2c0';
          g.lineWidth = rng.range(0.8, 2.2);
          for (const oy of [-S, 0, S]) {
            g.beginPath();
            g.ellipse(cx, cy + oy, r * rng.range(5, 8), r * rng.range(38, 62), 0, 0, 6.3);
            g.stroke();
          }
        }
      }
    }
    // a small tight knot in some boards
    if (rng.chance(0.4)) {
      const kx = x0 + rng.range(0.25, 0.75) * BAND;
      const ky = rng.range(0.1, 0.9) * S;
      const kr = rng.range(4, 9);
      for (let r = 3; r >= 1; r--) {
        g.globalAlpha = 0.2 + 0.2 * (4 - r);
        g.fillStyle = r === 1 ? '#5a3c20' : '#8a6238';
        g.beginPath();
        g.ellipse(kx, ky, kr * r * 0.5, kr * r * 0.75, 0, 0, 6.3);
        g.fill();
      }
      gb.globalAlpha = 0.6;
      gb.fillStyle = '#5a5a5a';
      gb.beginPath();
      gb.ellipse(kx, ky, kr * 0.6, kr * 0.9, 0, 0, 6.3);
      gb.fill();
    }
    // a finger joint: the comb where two lengths meet
    {
      const fy = rng.range(0.05, 0.95) * S;
      const teeth = 7;
      g.globalAlpha = 0.42;
      g.strokeStyle = '#7a5630';
      g.lineWidth = 1;
      g.beginPath();
      for (let t = 0; t <= teeth * 2; t++) {
        const x = x0 + (t / (teeth * 2)) * BAND;
        const y = fy + (t % 2 ? 9 : -9);
        if (t === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    // the glue line
    g.globalAlpha = 0.8;
    g.fillStyle = '#5a3d20';
    g.fillRect(x0 - 1, 0, 2, S);
    gb.globalAlpha = 1;
    gb.fillStyle = '#2a2a2a';
    gb.fillRect(x0 - 1.5, 0, 3, S);
  }
  g.globalAlpha = 1;
  gb.globalAlpha = 1;
  const map = tex(c);
  map.anisotropy = 16;
  return { map, bump: tex(b, { srgb: false }) };
}

// The end of a glulam member: each lamination shows the arcs of its growth
// rings, a board cut from a different part of a different log each time, with
// the glue line between. One tile is one lamination: U across the member's
// width, V across the lamination's thickness.
export function makeEndGrainTextures(): TexturePair {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const b = canvas(W, H);
  const g = ctx2d(c);
  const gb = ctx2d(b);
  const rng = new RNG(57);
  g.fillStyle = '#c9a877';
  g.fillRect(0, 0, W, H);
  gb.fillStyle = '#9a9a9a';
  gb.fillRect(0, 0, W, H);
  // the pith of the log lies off the board: rings cross it as arcs
  const px = rng.range(0.2, 0.8) * W;
  const py = H * rng.range(1.6, 2.4);
  for (let r = 40; r < py + H; r += rng.range(5, 11)) {
    const late = rng.range(1.2, 3.2);
    g.globalAlpha = rng.range(0.35, 0.7);
    g.strokeStyle = '#8f6a3c';
    g.lineWidth = late;
    g.beginPath();
    g.arc(px, py, r, 0, 6.3);
    g.stroke();
    gb.globalAlpha = 0.5;
    gb.strokeStyle = '#5c5c5c';
    gb.lineWidth = late;
    gb.beginPath();
    gb.arc(px, py, r, 0, 6.3);
    gb.stroke();
  }
  // pores and saw marks
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = rng.range(0.08, 0.3);
    g.fillStyle = rng.chance(0.6) ? '#6f4e2a' : '#ecd9b4';
    g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(0.6, 1.8), rng.range(0.6, 1.8));
  }
  // a drying check or two, running out from the pith side
  for (let i = 0; i < 2; i++) {
    const x = rng.range(0.1, 0.9) * W;
    g.globalAlpha = 0.5;
    g.strokeStyle = '#4a3218';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(x, H * rng.range(0.25, 0.5));
    g.lineTo(x + rng.range(-10, 10), H * rng.range(0.7, 0.95));
    g.stroke();
  }
  // the glue line, top and bottom of the tile
  g.globalAlpha = 0.85;
  g.fillStyle = '#573b1f';
  g.fillRect(0, 0, W, 3);
  g.fillRect(0, H - 3, W, 3);
  gb.globalAlpha = 1;
  gb.fillStyle = '#2a2a2a';
  gb.fillRect(0, 0, W, 4);
  gb.fillRect(0, H - 4, W, 4);
  g.globalAlpha = 1;
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

/** Random greys on a 64 by 64 lattice that repeats: read with smoothing, it is noise for a shader at the cost of one look-up. */
export function makeNoiseTexture(): THREE.DataTexture {
  const N = 64;
  const rng = new RNG(97);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = Math.floor(rng.range(0, 256));
    data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = v;
    data[4 * i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// A belt of trees seen from far off: only their outline against the sky and
// the dark of their crowns. Tileable round the horizon.
export function makeTreeBeltTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const c = canvas(W, H);
  const g = ctx2d(c);
  const rng = new RNG(73);
  g.clearRect(0, 0, W, H);
  // a tree is a few rounded masses on one stem line, not one disc
  const tree = (x: number, top: number, r: number, tone: string) => {
    g.fillStyle = tone;
    const lobes = rng.int(3, 6);
    for (const ox of [-W, 0, W]) {
      g.fillRect(x + ox - r * 0.7, top + r, r * 1.4, H);
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * 6.283;
        const lr = r * (0.45 + 0.35 * Math.abs(Math.sin(k * 2.3 + x)));
        g.beginPath();
        g.ellipse(x + ox + Math.cos(a) * r * 0.55, top + r + Math.sin(a) * r * 0.45, lr, lr * 0.85, 0, 0, 6.3);
        g.fill();
      }
    }
  };
  // a far row, paler and bluer with distance, then a nearer one over it: the haze is in the paint
  for (const [n, lo, hi, tones] of [
    [150, 0.38, 0.62, ['#93a8a2', '#9aaea6', '#8ea39c']],
    [170, 0.5, 0.78, ['#74907c', '#7c9783', '#6c8975', '#839c85']],
  ] as const) {
    for (let i = 0; i < n; i++) tree(rng.range(0, W), H * rng.range(lo, hi), rng.range(9, 26), rng.pick([...tones]));
  }
  // undergrowth closes the foot of the belt
  g.fillStyle = '#748f7b';
  g.fillRect(0, H * 0.86, W, H * 0.14);
  // light catches the tops
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,235,0.14)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(20,40,30,0.22)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeGravelTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = canvas(S, S);
  const g = ctx2d(c);
  const rng = new RNG(31);
  g.fillStyle = '#b3a996';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 14000; i++) {
    const v = rng.int(-38, 38);
    g.fillStyle = `rgb(${176 + v},${168 + v},${152 + v})`;
    g.globalAlpha = rng.range(0.4, 0.9);
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(1, 3.4);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, r, r * rng.range(0.6, 1), rng.range(0, 3), 0, 6.3);
        g.fill();
      }
  }
  g.globalAlpha = 1;
  return tex(c);
}

/** Crumbly planting soil for beds and root stations. */
export function makeSoilTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = canvas(S, S);
  const g = ctx2d(c);
  const rng = new RNG(47);
  g.fillStyle = '#4a3a2c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const v = rng.int(-22, 26);
    g.fillStyle = `rgb(${74 + v},${58 + v},${44 + v})`;
    g.globalAlpha = rng.range(0.35, 0.9);
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const r = rng.range(0.8, 3);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, r, r * rng.range(0.6, 1), rng.range(0, 3), 0, 6.3);
        g.fill();
      }
  }
  g.globalAlpha = 1;
  return tex(c);
}
