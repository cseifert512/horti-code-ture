import { describe, expect, it } from 'vitest';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/clematis-cirrhosa-freckles.ts';

describe('counts (temporary)', () => {
  it('prints', () => {
    for (const { kind, form, asset } of assetsOf(look)) {
      for (let v = 0; v < asset.variants; v++) {
        const row: string[] = [];
        for (let lod = 0; lod < asset.lods; lod++) {
          const g = asset.make(v, lod);
          g.computeBoundingBox();
          const b = g.boundingBox!;
          row.push(`${triangles(g)} [x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}]`);
        }
        console.log(`${kind} ${form} v${v}: ${row.join(' | ')}`);
      }
    }
    expect(true).toBe(true);
  });
});
