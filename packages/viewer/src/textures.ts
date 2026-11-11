// Procedural textures, ported from the Wisteria prototype
// (Wisteria/src/textures.js). Everything is drawn on a canvas at start-up, so
// the viewer ships no image files.
import * as THREE from 'three';
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

export function makeGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = canvas(S, S);
  const g = ctx2d(c);
  const rng = new RNG(3);
  g.fillStyle = '#5d7740';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(0, S);
    const y = rng.range(0, S);
    const l = rng.range(3, 9);
    const a = rng.range(-0.5, 0.5);
    g.strokeStyle = rng.pick(['#4d6936', '#6f8c49', '#7c9955', '#435c30', '#869f5c']);
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
// grain runs along V. One band = 1/8 of the texture width.
export function makeGlulamTextures(): TexturePair {
  const S = 512;
  const rng = new RNG(21);
  const o = { count: 420, width: 1.8, wobble: 4 };
  const c = streaks(S, rng, { base: '#d9bb8c', dark: '#8a6238', light: '#f1ddb6', ...o });
  const b = streaks(S, new RNG(21), { base: '#a8a8a8', dark: '#000000', light: '#ffffff', ...o });
  const g = ctx2d(c);
  const gb = ctx2d(b);
  for (let i = 0; i < 8; i++) {
    g.globalAlpha = rng.range(0.0, 0.16);
    g.fillStyle = rng.chance(0.5) ? '#7a5228' : '#fff2d2';
    g.fillRect(i * 64, 0, 64, S);
    g.globalAlpha = 0.75;
    g.fillStyle = '#5f4022';
    g.fillRect(i * 64 - 1, 0, 2, S);
    gb.globalAlpha = 1;
    gb.fillStyle = '#303030';
    gb.fillRect(i * 64 - 1, 0, 2, S);
  }
  g.globalAlpha = 1;
  return { map: tex(c), bump: tex(b, { srgb: false }) };
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
