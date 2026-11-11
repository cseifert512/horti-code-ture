# @horti/viewer

Renders a Bower from `@horti/core`, and the plants that grow on it, at the visual quality of the `Wisteria/` prototype. It reads core data and calls core functions; it holds no growth logic and adds no dates of its own.

```bash
npm run viewer:dev     # http://localhost:5193
npm run viewer:build   # static build in packages/viewer/dist
```

## What it shows

- **The structure.** Glulam ribs and the timber lattice as swept laminated sections, steel cables as fine tubes at their true diameter, stone pads under the feet, a planting pit at each root station, ground, sky, sun and soft shadows as in the prototype. Switch between the vault segment and the 15 m hemisphere.
- **The design overlay** (key `O`). Pick a root station and a route budget in metres. Every plant route is coloured by its shortest route length from that station and greyed out beyond the budget, part-way along a route where the budget runs out there. The panel gives nodes reached, route within budget, highest height reached, and the route length to the highest node, with a white-cased line along that route. Two buttons set the budget to the height of the highest node and to the route length to it, which is the point: on the hemisphere 7.5 m does not reach the 7.5 m crown and 11.78 m does. Below that: metres of glulam, of timber sub-lattice and of steel cable, and steel's share of plant route. Hover over a route for its id, kind, grasp diameter and length; click to keep it.
- **Plants.** Any `RenderData` (`packages/core/src/render/contract.ts`): the engine's reference scenarios (wisteria on the vault segment or on the 15 m hemisphere, trained or untended), run in the browser from `species/wisteria-sinensis/`, or a hand-made render test that works on either Bower. A timeline scrubs or plays through the run; the data's `statement` stays on screen with the picture, including when the interface is hidden (key `H`).

URL parameters: `bower=vault|hemisphere`, `overlay=1`, `station=<id>`, `budget=<m>`, `plants=trained|untended|fixture`, `day=<n>`, `ui=0`, `cam=x,y,z,tx,ty,tz` (three.js frame).

## Where things are

| Path | What |
|---|---|
| `src/scene/` | Stage (renderer, sky, sun, shadows, lawn), materials, ground dressing derived from the Bower. |
| `src/structure/` | `frames.ts` works out which way each timber section is turned; `sweep.ts` and `build.ts` make the meshes. |
| `src/overlay/` | `model.ts` asks the core (`analyseReach`, `shortestRoute`, `materialSummary`); `view.ts` draws the answer. |
| `src/plant/adapter.ts` | **The only place time enters the plant renderer.** Asks the core's `render/presence.ts` what is on the plant on the day shown, and turns the answer into stem presence and thickness (GLSL) and explicit organ states (0 to 1). If the contract changes, this file changes. |
| `src/plant/` | `wood.ts` (stem tubes), `organs.ts` (raceme, compound leaf, pod), `lod.ts` (instanced level of detail), `shaders.ts` (material patches), `view.ts` (puts them together), `scenario.ts` (runs the engine), `fixture.ts` (the hand-made test plant). |
| `test/` | Section orientation, the overlay's numbers, organ states against the contract. |

## Things to know

- **Section orientation is inferred.** The core gives a member's centre line and section size but not which way the section is turned. `frames.ts` takes the outer face to be where the member's plant routes lie, borrows from the lattice where a rib carries no route, and falls back to the plane of the arch. Each member reports how it was oriented.
- **The organ assets are *Wisteria sinensis*'s.** Raceme, pinnate leaf, pod, bark colours and the ages over which bark turns from green to grey come from the prototype. Mechanism traits do not transfer, so leaves and flowers are drawn only for wisteria (and the render test). A plant of any other taxon is drawn as stems only and named in the caption as lacking leaf and flower models.
- **The mixed planting is not offered yet.** The core can now grow wisteria, honeysuckle and clematis together (`mixedOnVault`). Showing it needs organ modules for the other two taxa, and the viewer drawing the scenario's own Bower, which has four root stations.
- **Two things are added for the picture,** and both are written in `adapter.ts`: within the time the core says an inflorescence is open, opening and then petal fall run up it from the base; and a new stem point is eased in over its first day so stems lengthen smoothly between whole days.
- **Not in the contract, so not drawn from engine data:** fruit (the test plant carries a few through a stand-in type), ground litter (the shader program is ported and unused), flower colour per taxon, and how much room an inflorescence has to swing.
