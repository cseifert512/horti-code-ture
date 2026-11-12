// A still at any size, from the camera as it stands: 4K, 8K, whatever a print
// needs. The picture is drawn in tiles, each larger than the screen could
// show, at twice the asked-for size in each direction, and brought down to
// size as the tiles are laid together, so that a cable a millimetre wide in
// the picture is a smooth line and not a row of steps. Each tile is drawn
// with a margin that is thrown away: the shading of corners looks a little
// way round each pixel, and would otherwise show a seam where tiles meet.
import * as THREE from 'three';
import type { Stage } from './stage.ts';

export interface StillOptions {
  width: number;
  height: number;
  /** Pixels drawn for each pixel kept, in each direction. 2 by default; 1 for speed. */
  supersample?: number;
}

/** The largest tile drawn at once, and the margin round it, in drawn pixels. */
const TILE = 1280;
const MARGIN = 48;

/**
 * Draw the stage's present view as a PNG. The camera's aspect is set to the
 * still's for the drawing and put back afterwards; the caller draws the next
 * ordinary frame.
 */
export async function renderStill(stage: Stage, options: StillOptions): Promise<Blob> {
  const { width, height } = options;
  const ss = Math.max(1, Math.round(options.supersample ?? 2));
  const fullW = width * ss;
  const fullH = height * ss;
  const camera = stage.camera;
  const aspect = camera.aspect;
  const view = camera.view ? { ...camera.view } : null;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const tileCanvas = document.createElement('canvas');
  const tileCtx = tileCanvas.getContext('2d');
  if (!tileCtx) throw new Error('2D canvas is not available');

  let target: THREE.WebGLRenderTarget | null = null;
  try {
    camera.aspect = width / height;
    for (let y = 0; y < fullH; y += TILE) {
      for (let x = 0; x < fullW; x += TILE) {
        const tw = Math.min(TILE, fullW - x);
        const th = Math.min(TILE, fullH - y);
        const w = tw + 2 * MARGIN;
        const h = th + 2 * MARGIN;
        if (!target || target.width !== w || target.height !== h) {
          target?.dispose();
          target = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: true });
        }
        camera.setViewOffset(fullW, fullH, x - MARGIN, y - MARGIN, w, h);
        camera.updateProjectionMatrix();
        stage.renderTo(target, w, h);
        const pixels = new Uint8Array(w * h * 4);
        stage.renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
        // rows come back bottom first; the margin is cut off as they are turned over
        const image = new ImageData(tw, th);
        for (let row = 0; row < th; row++) {
          const from = ((h - 1 - MARGIN - row) * w + MARGIN) * 4;
          image.data.set(pixels.subarray(from, from + tw * 4), row * tw * 4);
        }
        tileCanvas.width = tw;
        tileCanvas.height = th;
        tileCtx.putImageData(image, 0, 0);
        ctx.drawImage(tileCanvas, 0, 0, tw, th, x / ss, y / ss, tw / ss, th / ss);
        // let the page breathe between tiles: a large still takes seconds
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    target?.dispose();
    camera.aspect = aspect;
    if (view?.enabled) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  return new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('the still could not be encoded'))), 'image/png'));
}

/** Offer a blob to the person at the screen as a file to keep. */
export function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
