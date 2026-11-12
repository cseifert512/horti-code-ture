import { it } from 'vitest';
import { triangles } from '../../src/plant/kit.ts';
import { assetsOf } from '../../src/plant/look.ts';
import { look } from '../../src/plant/taxa/vitis-coignetiae.ts';

// scaffolding while the models are being made: prints the size of each
it('measures', () => {
  for (const { kind, asset } of assetsOf(look)) {
    for (let v = 0; v < asset.variants; v++) {
      const row: string[] = [];
      for (let lod = 0; lod < asset.lods; lod++) {
        const g = asset.make(v, lod);
        g.computeBoundingBox();
        const b = g.boundingBox!;
        row.push(`${triangles(g)}/${asset.budget[lod]}`);
        if (lod === 0) row.push(`x ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)} y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)} z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`);
      }
      console.log(`${kind} ${asset.key} v${v}: ${row.join('  ')}`);
    }
  }
});
