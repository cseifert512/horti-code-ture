# Horti-code-ture

**Bower's computational horticulture: specification, taxon library and growth simulator.**  
**Version:** 0.2 — 11 November 2026  
**Baseline climate:** temperate United Kingdom; site-specific adaptation required everywhere else.  
**Point of departure:** the procedural *Wisteria sinensis* prototype in [`Wisteria/`](Wisteria/).

## What this is

Three things in one repository:

1. **A specification** — the root documents: planting logic, simulation data concepts, biological and mechanical constraints, gardener interventions and a staged development programme.
2. **A candidate taxon library** — [`species/`](species/): 17 named taxa and cultivars, each with a human-readable `SPECIES_PROFILE.md`.
3. **A simulator under construction** — [`packages/core`](packages/core): the data contract and simulation core that the specification describes. The earlier [`Wisteria/`](Wisteria/) prototype is kept as a visual and behavioural reference; it is a single-species time-lapse, not the model the specification asks for.

This is **not** a verified biological prediction model, a planting specification ready for construction, or a source of structural loads.

## Layout

| Path | Contents |
|---|---|
| `PROJECT_CONTEXT.md` and the other root `.md` files | The specification. Read these before making global decisions. |
| `species/<id>/` | One folder per taxon. Folder names are ASCII ids; botanical names, accepted names and synonyms are recorded inside. |
| `packages/core/` | `@horti/core` — TypeScript, no rendering dependencies. Vocabulary, provenance rules, the manufactured-structure graph, reference Bowers, calendar. |
| `Wisteria/` | The original three.js prototype of *W. sinensis* on a glulam vault. Self-contained (`npm install` inside it). |
| `docs/ASSUMPTIONS_AUDIT.md` | What was tested on 11 November 2026, what held, what did not, and what was changed. |

## Reading order

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — why this exists and how to decide between competing implementations.
2. [KEY.md](KEY.md) — species relationships, planting palette, global architecture versus local plant supports.
3. [SIMULATION_KEY.md](SIMULATION_KEY.md) — modelling objectives, domain entities, dynamics, equations, outputs and assumptions.
4. [CONSTRAINTS_AND_PHENOLOGY.md](CONSTRAINTS_AND_PHENOLOGY.md) — attachment mechanics, buds, flowering, dormancy, seasonal development and physical limits.
5. [HORTICULTURAL_INTERVENTIONS.md](HORTICULTURAL_INTERVENTIONS.md) — gardener events, pruning, training, replanting and monitoring.
6. [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) — agent roles, milestones and acceptance checks.
7. [SOURCES_AND_ASSUMPTIONS.md](SOURCES_AND_ASSUMPTIONS.md) — literature and the evidence-confidence policy.
8. [docs/ASSUMPTIONS_AUDIT.md](docs/ASSUMPTIONS_AUDIT.md) — the tested state of all of the above.
9. Each `species/<id>/SPECIES_PROFILE.md`.

## Running it

Requires Node 24 or later.

```bash
npm install          # workspace tooling for packages/*
npm run check        # type-check and run the core tests
```

The prototype is separate:

```bash
npm --prefix Wisteria install
npm run prototype:dev           # time-lapse viewer on http://localhost:5173
npm run prototype:audit         # interference audit (stem vs structure, stem vs stem)
npm run prototype:assumptions   # measures what the prototype actually assumes
```

## Scope and status

- **17 named taxa/cultivars**, including *Wisteria sinensis* and *W. floribunda* 'Macrobotrys'. Several are alternatives rather than plants to combine in one Bower.
- One non-climber (*Sarcococca confusa*) is included intentionally as an adjacent winter-scent shrub.
- A single evergreen-plus-deciduous planting composition is a **design framework**, not an instruction to install all species.
- Mechanistic differences are fundamental: twining stems, twining petioles, tendrils, aerial roots, scrambling canes, and non-climbing shrubs.
- **The specification invents no plant growth rates, support-diameter tolerances, frost responses, wind loads or flowering probabilities.** The prototype does contain such numbers as unlabelled constants; they are catalogued in the audit. The new core admits a number only with an evidence status attached, so every assumption shows up in the reports that depend on it.
- A gardener is an active agent in the simulation; plants are not assumed to grow successfully without intervention.

## Working rules for agents

- Never equate published mature height with annual shoot growth or the reachable route across a curved Bower.
- Keep the manufactured Bower graph separate from the living plant graph. *Wood age* in flowering biology refers to the plant's own shoots, **not** manufactured Bower timber.
- Primary timber is not a climbing surface by default. Plants travel secondary, replaceable supports.
- Preserve lineage: removing a living stem also removes its attached leaves, buds, flowers and support contacts.
- Differentiate `evidence`, `model assumption`, `design target`, `unresolved question` and `site-dependent decision`. The canonical status list, and how these words map on to it, is in [`packages/core/src/vocab.ts`](packages/core/src/vocab.ts).
- Do not hard-code flowering months as proof of blooming; represent environmental and plant-history gating as the model matures.
- Do not represent the mathematical outputs as validated structural loads.
- All geographic deployments need ecology/horticulture review, including checks for invasive species, biosecurity and public safety.
