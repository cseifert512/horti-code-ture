# Horti-code-ture — working notes for agents

Bower builds timber lattices that plants and gardeners finish. This repository is the specification, taxon library and simulator for how climbing plants occupy such a structure over years. Read `PROJECT_CONTEXT.md` before any global decision: it sets the priority order (safety and plausibility first, visual impressiveness last) and the test for whether a feature belongs.

## Layout

- Root `*.md` — the specification. `README.md` gives the reading order.
- `docs/ASSUMPTIONS_AUDIT.md` — tested state of the spec and prototype, with the prototype model map.
- `species/<id>/` — `SPECIES_PROFILE.md` (prose) and `taxon.json` (validated data) per taxon.
- `packages/core/` — `@horti/core`, the simulation core. TypeScript, no rendering dependencies. `src/sim/engine.ts` is the daily-step engine; `src/sim/report.ts` turns a run into the design report; `src/render/contract.ts` is what a viewer draws from and `src/render/presence.ts` says what is on the plant on a given day (use it; do not re-derive seasons); `species/<id>/model.json` holds the numbers a taxon's growth assumes.
- `packages/viewer/` — `@horti/viewer`, the three.js viewer. It draws what the core gives it and holds no growth logic; `src/plant/adapter.ts` is the only file where days become what is drawn, and it asks `presence.ts`.
- `Wisteria/` — the original three.js prototype. Reference only; it has its own `node_modules`.

## Commands

```bash
npm run check                   # tsc + vitest for packages/*
npm test                        # vitest only
npm run simulate                # reference scenario: yearly account, gardener's log, design report; render data and report in out/
npm run viewer:dev              # viewer on http://localhost:5193
npm run viewer:build            # static build of the viewer
npm run prototype:audit         # prototype interference audit
npm run prototype:assumptions   # prototype behaviour baseline
```

The prototype's dev server is pinned to port 5173, which another session may hold. `.claude/launch.json` starts it on 5183 instead, and the viewer (`bower-viewer`) on 5193.

## Rules that are easy to break

- **No bare numbers about plants.** Any growth rate, grasp diameter, threshold or probability enters as a `Sourced` value (`packages/core/src/provenance.ts`) with an evidence status. Unknown stays `unknown` with a null value; a number chosen to make the model run is `provisional_design_assumption` with a stated basis. Do not relabel a guess as published.
- **Two graphs.** Manufactured structure (`bower/`) and living plant are separate. "Old wood" means the plant's own stems.
- **The timber is the growing surface.** Plants twine, lie along and cling to the glulam itself. The sub-lattice is timber first, with slender steel cables only where timber cannot give a hold. No steel rods or frames; visible steel is a cost to be reported and minimised. `contact: 'prohibited'` exists for exclusions a project declares, and nothing is prohibited by default.
- **Visuals are proof.** The owners are architects and ecologists who sell buildings: every modelling step must end in something that can be rendered and shown.
- **Height is not route length.** Reach is computed on the support graph.
- **Pruning removes lineage**, not mesh: descendants, buds, organs and contacts go with the cut stem.
- **A flowering month is an envelope, not a trigger.** Never show flowers because the calendar says so.
- **Mechanism traits do not transfer.** Spurs, handedness and old-wood flowering are wisteria's; each mechanism and flowering class is implemented separately.
- Vocabulary comes from `packages/core/src/vocab.ts`. Add a term there, with its mapping, before using it anywhere else.

## Conventions

- World frame: right-handed, metres, x east, y north, z up. three.js `(x, y, z)` = core `(x, z, -y)`.
- Handedness is helix chirality: `right_handed` = anticlockwise seen from above when climbing.
- Time: whole days since a scenario epoch, ISO dates, UTC.
- Units: length m, diameter mm, area m2, mass kg, force N, temperature degC.
- TypeScript: erasable syntax only (no enums, no parameter properties), relative imports end in `.ts`, zod `strictObject` for anything read from disk.
- Tests name the specification clause they enforce.
- Each plant has three random streams (`arch`, `organ`, `flower`). Draw from the one that matches what you are deciding, so that an intervention changes only what it touches and scenarios stay comparable.
- Shell: put anything with quotes or non-ASCII text (patch scripts, commit messages) in a file and run that; long inline heredocs have failed to parse here.

## Git

- Branch `main`, remote `origin` (public GitHub repository). Commit and push as work progresses.
- Write commit messages through a Bash heredoc (`git commit -F - <<'EOF'`). PowerShell mangles messages that contain double quotes.
