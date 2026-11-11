import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { makeVaultBower } from '../src/bower/vault.ts';
import { LightGeometry, exposureField } from '../src/light/exposure.ts';
import { DEFAULT_SITE } from '../src/light/site.ts';
import { sunAt, sunPath } from '../src/light/sun.ts';
import { dayLengthHours } from '../src/calendar.ts';

const noon = sunAt(DEFAULT_SITE, 172, 12);
console.log('midsummer noon', noon.elevationDeg.toFixed(2), noon.azimuthDeg.toFixed(1), noon.direction);
const w = sunAt(DEFAULT_SITE, 355, 12);
console.log('midwinter noon', w.elevationDeg.toFixed(2), w.azimuthDeg.toFixed(1));
const rise = sunAt(DEFAULT_SITE, 172, 4.5);
console.log('midsummer 04:30', rise.elevationDeg.toFixed(2), rise.azimuthDeg.toFixed(1));
console.log('path hours june', sunPath(DEFAULT_SITE, 166).reduce((s, x) => s + x.hours, 0).toFixed(2), 'daylength', dayLengthHours(51.5, 166).toFixed(2));

for (const [name, bower] of [['hemisphere', makeHemisphereBower({ stations: 12 })], ['vault', makeVaultBower()]] as const) {
  let t0 = performance.now();
  const f = exposureField(bower, DEFAULT_SITE);
  console.log(`\n${name}: ${f.points.length} points in ${(performance.now() - t0).toFixed(0)} ms`);
  for (const p of f.points.filter((p) => p.kind === 'station')) console.log(`  ${p.id.padEnd(10)} ${p.facing.padEnd(6)} ${p.bearingDeg.toFixed(0).padStart(4)}  Jun ${p.hours[5]!.toFixed(1)} h  Dec ${p.hours[11]!.toFixed(1)} h  share Jun ${p.share[5]!.toFixed(3)} Dec ${p.share[11]!.toFixed(3)}`);
  const by: Record<string, { m: number; j: number; d: number; sj: number; sd: number }> = {};
  for (const p of f.points.filter((p) => p.kind === 'route')) {
    const b = (by[p.facing] ??= { m: 0, j: 0, d: 0, sj: 0, sd: 0 });
    b.m += p.routeM; b.j += p.routeM * p.hours[5]!; b.d += p.routeM * p.hours[11]!; b.sj += p.routeM * p.share[5]!; b.sd += p.routeM * p.share[11]!;
  }
  for (const [k, b] of Object.entries(by)) console.log(`  routes facing ${k.padEnd(6)} ${b.m.toFixed(0).padStart(4)} m  Jun ${(b.j / b.m).toFixed(1)} h  Dec ${(b.d / b.m).toFixed(1)} h  share Jun ${(b.sj / b.m).toFixed(3)} Dec ${(b.sd / b.m).toFixed(3)}`);
}
// a wall to the south of the hemisphere
const site = { ...DEFAULT_SITE, obstructions: [{ id: 'wall', kind: 'wall' as const, from: [-12, -11] as [number, number], to: [12, -11] as [number, number], heightM: 6 }, { id: 'oak', kind: 'tree' as const, at: [0, 14] as [number, number], heightM: 12, crownRadiusM: 5, leafHabit: 'deciduous' as const }] };
const t0 = performance.now();
const f = exposureField(makeHemisphereBower({ stations: 12 }), site);
console.log(`\nwith a 6 m wall 3 m south and an oak north: ${(performance.now() - t0).toFixed(0)} ms`);
for (const p of f.points.filter((p) => p.kind === 'station')) console.log(`  ${p.id.padEnd(10)} ${p.facing.padEnd(6)} Jun ${p.hours[5]!.toFixed(1)} h  Dec ${p.hours[11]!.toFixed(1)} h  share Jun ${p.share[5]!.toFixed(3)} Dec ${p.share[11]!.toFixed(3)}`);
