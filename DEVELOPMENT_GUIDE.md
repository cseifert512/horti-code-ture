# DEVELOPMENT_GUIDE — agent handoff, stages and acceptance criteria

## Objective

Extend the **already existing *Wisteria sinensis* generative algorithm** to a scientifically disciplined, multi-species, Bower-aware simulator without prematurely implementing computationally expensive biology or engineering. **This repository currently contains only documentation.** Agents should inspect the existing project and implement in its own codebase; do not assume a language, renderer, engine, geometric representation or package architecture.

## Roles / workstreams

| Agent | Owns | Initial handoff artifact |
|---|---|---|
| Botanical curator | Taxonomy, phenology, growth forms, evidence provenance, UK and site suitability | Reviewed species cards + disputed/unknown parameter list |
| Simulation architecture lead | Shared data contract, plant-state continuity, time stepping and graph separation | Agreed conceptual schema and compatibility plan with existing wisteria code |
| Attachment/geometry specialist | Contact mechanisms, secondary support graph, path routing, collision and exclusions | Attachment mechanism classes + calibration experiment plan |
| Phenology specialist | Bud/cohort states, dormancy, flowering wood, leaves, weather response | Species flowering/foliage state diagrams and evidence labels |
| Horticulture/operations specialist | Human gardener actions, realistic maintenance, intervention constraints | Action catalog + UK annual management calendar |
| Scene/ecology specialist | Plant placement, light, shade, root-site resources and multi-plant overlap | Spatial placement/zoning rules + interactions list |
| Validation/QA lead | Scientific and visual test scenarios, provenance, model uncertainty | Repeatable acceptance scenarios and discrepancies log |

A single person or agent may combine several roles. No role is licensed to insert unsupported species-specific numeric parameters.

## Stage 0 — inspect and preserve the existing *Wisteria sinensis* model

**Tasks:** Document current generated plant entities, axis representation, growth iteration, renderer, time scale, coordinate convention, randomness and external inputs. Capture 3–5 reference outputs and create a behaviour baseline. Identify what is genuinely wisteria-specific versus generic plant logic.

**Exit check:** A written model map identifies where to attach future species data **without rewriting or discarding** existing work.

## Stage 1 — define the data contract and provenance

**Tasks:** Adopt shared conceptual entities in `SIMULATION_KEY.md` (Bower member, local support, root station, taxon profile, individual plant, stem/axis, bud, organ cohort, contact and gardener event). Define physical units, accepted taxon names, persistent IDs, age/cohort logic and source-quality labels.

**Exit check:** One existing *W. sinensis* run can be expressed in the new structure; no unrelated assumptions are accidentally assigned to all climbers. Data provenance is reviewable.

## Stage 2 — stabilise wisteria architecture, annual history and gardener control

**Tasks:** Keep the existing *W. sinensis* procedural growth while adding perennial stem survival, growth cohorts, spring/summer season state, manual train/tie/prune and rudimentary flower-spur history. Distinguish actual botanical stem from Bower's timber members.

**Exit check:** The same plant persists across ≥5 simulated years; annual shoot flush and winter leaf drop are plausible; a saved bud cannot bloom after its bearing shoot has been cut.

## Stage 3 — abstract mechanical attachment into shared strategies

**Tasks:** Add independent attachment mechanism classes:

1. Stem twining (wisteria, honeysuckle, star jasmine, akebia, Thunbergia).
2. Petiole twining (clematis).
3. Tendril (grape).
4. Aerial-root attachment (ivy, climbing hydrangea, Campsis).
5. Manual scrambling/tie (rose).
6. Non-climber (Sarcococca).

Represent contact-permitted/prohibited zones and graft local support geometry to primary Bower geometry. Keep species-specific diameter and contact parameters uncalibrated until field evidence.

**Exit check:** Each species can approach a support, attempt a biologically correct kind of contact, fail without support, and be rescued by an explicit gardener training event where legitimate.

## Stage 4 — implement coarse phenology and flowering-wood rules

**Tasks:** Model leaf persistence by habit, seasonal bud/flower states and pruning-sensitive growth cohorts. Begin with named seasonal windows **flagged provisional** and explicit old-wood/current-season logic. Develop optional temperature response using a clear data contract for measured thresholds.

**Exit check:** Wisteria flower outcome responds to past-season bud survival; Group 1 *C. cirrhosa* and Group 3 *C. viticella* have materially different responses to severe pruning; *Lonicera henryi* persists in winter unless exposed conditions cause damage.

## Stage 5 — add site-aware placement and multi-species scenes

**Tasks:** Input Bower shell, cardinal orientation, light/shade map, root stations, climber paths, visitor clearances and service envelopes. Add qualitative light/space/root competition. Implement `KEY.md` reference palette as **a scenario**, not a universal planting mandate.

**Exit check:** A 15-m diameter hemispherical shell checks its base-to-crown surface-path length (~11.78m) rather than vertical height (7.5m); a 4m clematis is not assumed to cover the crown; restricted ivy can't colonise primary timber.

## Stage 6 — operationally credible gardeners

**Tasks:** Add event log, seasonal tasks, pruning/regrowth, tie ageing/adjustment, inspection, annual *Thunbergia* replacement and plant failure/replacement. Make human actions visible in the model's chronology.

**Exit check:** Two runs with identical initial conditions but different gardening calendars produce different structure, flower and maintenance outputs. A complete run can explain **which human actions caused a change**.

## Stage 7 — evaluation and calibration plan

**Tasks:** Collect real plant and support observations from accessible prototypes and nurseries; compare attachment, shoot paths, pruning outcomes and phenology. Add credible intervals and scenario uncertainty. Calibrate taxa one at a time. Validate visuals from fixed observer positions and multiple dates.

**Exit check:** Each calibrated parameter has taxon/cultivar, context, measurement method, uncertainty and source. Unsupported parameters remain labelled assumptions; the simulator does not claim engineering reliability.

## Stage 8 — longer-term research (explicitly optional)

Only after basic geometry/season/maintenance works: plant carbon allocation, empirical stem pressure/stress, bark/support injury, dynamic vegetation drag and water loads, soil/root competition, habitat metrics, climate scenario ensembles, automatic planting optimisation and gardener scheduling agents. These are **research opportunities**, not dependencies of the initial version.

## Recommended implementation order of additional species

| Order | Species | Reuse / new requirement |
|---|---|---|
| 1 | *W. floribunda* 'Macrobotrys' | Reuse wisteria topology but change racemes, flower timing, direction convention, growth envelope |
| 2 | *L. henryi* | Reuse twining; add persistent evergreen leaf state |
| 3 | *C. viticella* 'Étoile Violette' | Add petiole attachment; hard prune and flower on current-season growth |
| 4 | *C. cirrhosa* 'Freckles' | Reuse petiole attachment; previous-year flowering and winter window |
| 5 | *T. jasminoides* | Reuse evergreen twining; warm/sheltered microclimate constraints |
| 6 | *Vitis coignetiae* | Add tendrils, large leaves, autumn colour |
| 7 | *Rosa* 'The Generous Gardener' | Add manual tie/scramble and repeat blooms |
| 8 | *Hedera helix* / *Hydrangea* | Add aerial-root surfaces and strict timber exclusions |
| 9 | *Thunbergia* / *Sarcococca* | Annual reset by gardener / ground-only companion |
| 10 | All remaining optional taxa | Palette coverage and site-specific constraints |

## Model acceptance checklist

- [ ] Separate manufactured and living graphs.
- [ ] Persistent plant history, with growth cohort and bud ancestry.
- [ ] Model's coordinate convention, handedness, time step and units written down.
- [ ] Six attachment classes (including non-climber) with correct taxon mappings.
- [ ] No successful attachment in forbidden timber/maintenance zones.
- [ ] Humans can train, attach, detach, prune, monitor and replant as explicit operations.
- [ ] Old-wood and current-season flowering react differently to pruning.
- [ ] Winter foliage and year-round flowering are not guaranteed merely by species label.
- [ ] Curved shell uses support-path length, not vertical height alone.
- [ ] Multi-species paths can be separate, overlapping or conflicting by explicit rules.
- [ ] Each numeric parameter is sourced, measured or visibly provisional.
- [ ] Outputs are interpretable by an architect, gardener and structural engineer **without claiming false physical precision**.

## Smallest valuable first deliverable

A **five-year, daily-step model** of one trained *W. sinensis* on a curved Bower segment with a separate wire/rod support, visible woody-stem persistence, flowering buds that survive or are removed by gardening, dormant/leafing seasons and a readable action log. Then add one evergreen honeysuckle and one Group 3 clematis on separate routes. That produces meaningful species diversity without tackling every research problem simultaneously.
