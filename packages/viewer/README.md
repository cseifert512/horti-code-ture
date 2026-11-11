# @horti/viewer

Renders a Bower from `@horti/core`, and the plants that grow on it, at the visual quality of the `Wisteria/` prototype. It reads core data and calls core functions; it holds no growth logic and adds no dates of its own.

```bash
npm run viewer:dev     # http://localhost:5193
npm run viewer:build   # static build in packages/viewer/dist
```

## What it shows

- **The structure.** Glulam ribs and the timber lattice as swept laminated sections, steel cables as fine tubes at their true diameter, stone pads under the feet, a planting pit at each root station, ground, sky, sun and soft shadows as in the prototype. Switch between the vault segment and the 15 m hemisphere.
- **The design overlay** (key `O`). Pick a root station and a route budget in metres. Every plant route is coloured by its shortest route length from that station and greyed out beyond the budget, part-way along a route where the budget runs out there. The panel gives nodes reached, route within budget, highest height reached, and the route length to the highest node, with a white-cased line along that route. Two buttons set the budget to the height of the highest node and to the route length to it, which is the point: on the hemisphere 7.5 m does not reach the 7.5 m crown and 11.78 m does. Below that: metres of glulam, of timber sub-lattice and of steel cable, and steel's share of plant route. Hover over a route for its id, kind, grasp diameter and length; click to keep it.
- **Plants.** Any `RenderData` (`packages/core/src/render/contract.ts`). The engine's reference scenarios run in the browser from the files in `species/`: wisteria on the vault segment or the 15 m hemisphere; the mixed planting on the vault; and the KEY.md reference palette on the hemisphere, twelve plants, trained, untended or with ivy. A scenario is drawn on the Bower it was grown on, so the mixed planting brings its five-station vault and the palette its twelve-station dome. There is also a hand-made render test that works on either Bower.
- **The design report.** Beside any engine scenario: the core's flowering calendar (plants by months, brighter the more flowers were open on the 15th, hatched where a plant's flowering is not modelled, with a line for the months when nothing flowers) and winter evergreen cover from each of the scenario's viewpoints against the 25 to 40% design target. Selecting a month goes to its date; selecting a viewpoint stands the camera there.
- **Time.** A timeline scrubs or plays through the run (space bar). The gardener's log is listed beside the picture: entries not yet made are dimmed, the latest is marked, and clicking one goes to its day. The data's `statement` and the count of assumptions behind the run stay on screen with the picture, including when the interface is hidden (key `H`).

URL parameters: `bower=vault|hemisphere`, `overlay=1`, `station=<id>`, `budget=<m>`, `plants=trained|untended|mixed-trained|mixed-untended|palette-trained|palette-untended|palette-ivy|fixture`, `day=<n>`, `ui=0`, `cam=x,y,z,tx,ty,tz` (three.js frame).

## Where things are

| Path | What |
|---|---|
| `src/scene/` | Stage (renderer, sky, sun, shadows, lawn), materials, ground dressing derived from the Bower. |
| `src/structure/` | `frames.ts` works out which way each timber section is turned; `sweep.ts` and `build.ts` make the meshes. |
| `src/overlay/` | `model.ts` asks the core (`analyseReach`, `shortestRoute`, `materialSummary`); `view.ts` draws the answer. |
| `src/plant/adapter.ts` | **The only place time enters the plant renderer.** Asks the core's `render/presence.ts` what is on the plant on the day shown, and turns the answer into stem presence and thickness (GLSL) and explicit organ states (0 to 1). If the contract changes, this file changes. |
| `src/plant/assets.ts` | Which leaf and flower models each taxon is drawn with, and their colours. A taxon not listed gets a plain stand-in leaf and is captioned as a provisional look. |
| `src/plant/kit.ts` | Geometry tools the organ modules share: blades, fan-built lobed blades, compound leaves, tufts of stamens. |
| `src/plant/organs*.ts` | One module per genus: `organs.ts` (wisteria: raceme, pinnate leaf, pod), `-lonicera` (two honeysuckles), `-clematis` (three clematis), `-rosa`, `-hydrangea`, `-trachelospermum`, `-vitis`, `-hedera`, and `-generic` (the stand-in leaf). |
| `src/plant/` | `wood.ts` (stem tubes), `lod.ts` (instanced level of detail), `shaders.ts` (material patches), `view.ts` (puts them together), `scenario.ts` (runs the engine and its report), `fixture.ts` (the hand-made test plant). |
| `src/report/panel.ts` | Lays out the core's design report: the flowering calendar and the winter cover meters. |
| `test/` | Section orientation, the overlay's numbers, organ states against the contract. |

## Things to know

- **Section orientation is inferred.** The core gives a member's centre line and section size but not which way the section is turned. `frames.ts` takes the outer face to be where the member's plant routes lie, borrows from the lattice where a rib carries no route, and falls back to the plane of the arch. Each member reports how it was oriented.
- **Organ models are per taxon.** Mechanism traits do not transfer, and neither do looks. Eleven taxa have leaf models of their own and nine have flower models: wisteria (the prototype's raceme, pinnate leaf and pod), two honeysuckles, three clematis, climbing rose, climbing hydrangea, star jasmine, vine and ivy (the last two leaf only). A plant of any other taxon gets a plain stand-in leaf and no flowers, and the caption says its look is provisional.
- **The new models were made from descriptions, not from specimens.** Shapes and colours follow the taxon profiles and the engine session's notes. They need a horticulturist's eye before they are shown as likenesses.
- **Bark is wisteria's for every plant.** Stems of all taxa use the one bark material and its age-to-colour table (`WISTERIA_WOOD_LOOK` in `shaders.ts`). Thin clematis and honeysuckle stems mostly read as green shoots, but old honeysuckle wood is drawn as grey wisteria bark.
- **A clematis flower has no direction in the data.** `RenderFlower` gives a position and a size. The open flower is stood on a stalk rising from its node and turned to a random compass direction.
- **Two things are added for the picture,** and both are written in `adapter.ts`: within the time the core says an inflorescence is open, opening and then petal fall run up it from the base; and a new stem point is eased in over its first day so stems lengthen smoothly between whole days.
- **Not in the contract, so not drawn from engine data:** fruit (the test plant carries a few through a stand-in type), ground litter (the shader program is ported and unused), flower colour per taxon, and how much room an inflorescence has to swing.
