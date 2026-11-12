import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf, ceilingFor } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/clematis-viticella-etoile-violette.ts';

// first pass: measure what the models come to
describe('measure', () => {
  it('prints triangles and extents', () => {
    for (const { kind, form, asset } of assetsOf(look)) {
      for (let v = 0; v < asset.variants; v++) {
        const row: string[] = [];
        for (let lod = 0; lod < asset.lods; lod++) {
          const g = asset.make(v, lod);
          g.computeBoundingBox();
          const b = g.boundingBox!;
          row.push(`${triangles(g)}/${asset.budget[lod]} (ceil ${ceilingFor(kind, lod, asset.lods)}) x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}`);
        }
        console.log(`${kind} ${form} v${v}: ${row.join(' | ')}`);
      }
    }
    // reach of the flower-tagged parts
    for (const asset of Object.values(look.flowers ?? {})) {
      for (let v = 0; v < asset.variants; v++) {
        const g = asset.make(v, 0);
        const pos = g.getAttribute('position');
        const part = g.getAttribute('aPart');
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < pos.count; i++) if (part.getW(i) >= 0) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
        let widest = 0;
        const step = Math.max(1, Math.floor(pts.length / 400));
        for (let i = 0; i < pts.length; i += step) for (let j = i + 1; j < pts.length; j += step) widest = Math.max(widest, pts[i]!.distanceTo(pts[j]!));
        console.log(`cyme v${v}: reach ${widest.toFixed(3)} of authored ${asset.authoredSize}`);
      }
    }
    expect(true).toBe(true);
  });
});
