# DEVELOPMENT_GUIDE — agent handoff, stages and acceptance criteria

## Objective

Extend the **already existing *Wisteria sinensis* generative algorithm** to a scientifically disciplined, multi-species, Bower-aware simulator without prematurely implementing computationally expensive biology or engineering.

**Where the code is.** The existing algorithm is the prototype in `Wisteria/` (JavaScript, three.js, Vite). The new simulator is built beside it in `packages/core` (TypeScript, no rendering dependencies), with the taxon library in `species/`. The prototype's language, renderer and data layout are a starting point, not a constraint: its tested behaviour and the places it departs from this specification are recorded in `docs/ASSUMPTIONS_AUDIT.md`.

**Conventions fixed so far** (acceptance checklist, "coordinate convention, handedness, time step and units written down"): world frame right-handed, metres, x east, y north, z up; twining handedness stated as helix chirality (`right_handed` = anticlockwise seen from above when climbing); the clock counts whole days on ISO dates; lengths m, diameters mm. Vocabulary lives in `packages/core/src/vocab.ts`.

## Roles / workstreams

| Agent | Owns | Initial handoff artifact |
|---|---|---|
| Botanical curator | Taxonomy, phenology, growth forms, evidence provenance, UK and site suitability | Reviewed species cards + disputed/unknown parameter list |
| Simulation architecture lead | Shared data contract, plant-state continuity, time stepping and graph separation | Agreed conceptual schema and compatibility plan with existing wisteria code |
| Attachment/geometry specialist | Contact mechanisms, the timber and sub-lattice route graph, path routing, collision and exclusions | Attachment mechanism classes + calibration experiment plan |
| Phenology specialist | Bud/cohort states, dormancy, flowering wood, leaves, weather response | Species flowering/foliage state diagrams and evidence labels |
| Horticulture/operations specialist | Human gardener actions, realistic maintenance, intervention constraints | Action catalog + UK annual management calendar |
| Scene/ecology specialist | Plant placement, light, shade, root-site resources and multi-plant overlap | Spatial placement/zoning rules + interactions list |
| Validation/QA lead | Scientific and visual test scenarios, provenance, model uncertainty | Repeatable acceptance scenarios and discrepancies log |

A single person or agent may combine several roles. No role is licensed to insert unsupported species-specific numeric parameters.

## Stage 0 — inspect and preserve the existing *Wisteria sinensis* model

**Tasks:** Document current generated plant entities, axis representation, growth iteration, renderer, time scale, coordinate convention, randomness and external inputs. Capture 3–5 reference outputs and create a behaviour baseline. Identify what is genuinely wisteria-specific versus generic plant logic.

**Exit check:** A written model map identifies where to attach future species data **without rewriting or discarding** existing work.

**Status (11 November 2026): done.** The model map and behaviour baseline are in `docs/ASSUMPTIONS_AUDIT.md`; `npm run prototype:assumptions` reproduces the measurements. Finding: the prototype computes a plant's whole life in one pass and keeps no state that an event could change, so gardener actions, weather and bud history cannot be attached to it as it stands. Its geometry methods (contact-line stems, crossing resolution, coiling on cables, time-scrubbable rendering) are to be carried over; its growth logic is to be replaced by a stepped model.

## Stage 1 — define the data contract and provenance

**Tasks:** Adopt shared conceptual entities in `SIMULATION_KEY.md` (Bower member, local support, root station, taxon profile, individual plant, stem/axis, bud, organ cohort, contact and gardener event). Define physical units, accepted taxon names, persistent IDs, age/cohort logic and source-quality labels.

**Exit check:** One existing *W. sinensis* run can be expressed in the new structure; no unrelated assumptions are accidentally assigned to all climbers. Data provenance is reviewable.

**Status (11 November 2026): done.** In `packages/core`: canonical vocabulary, provenance rules, taxon schema and data for all 17 taxa, the structure as timber members and cables with a route graph, the two reference Bowers, calendar, the living plant graph (`sim/types.ts`: axes, runs, flower buds, leaf sites), gardener events as data, and a separate growth-model file per taxon holding every number the engine assumes (`species/wisteria-sinensis/model.json`: 60 parameters, 58 provisional, 2 published, none measured).

## Stage 2 — stabilise wisteria architecture, annual history and gardener control

**Tasks:** Keep the existing *W. sinensis* procedural growth while adding perennial stem survival, growth cohorts, spring/summer season state, manual train/tie/prune and rudimentary flower-spur history. Distinguish actual botanical stem from Bower's timber members.

**Exit check:** The same plant persists across ≥5 simulated years; annual shoot flush and winter leaf drop are plausible; a saved bud cannot bloom after its bearing shoot has been cut.

**Status (11 November 2026): done for *W. sinensis*; exit check met and tested** (`packages/core/test/engine.test.ts`). `sim/engine.ts` steps a day at a time: stems persist and thicken, laterals break from buds left at nodes, whippy shoots are thrown each year, spurs form, flower buds form in late summer on spurs and summer-pruned shoots and open the next spring only if their wood is still there. `npm run simulate` prints the yearly account and the gardener's log. Not yet modelled, and worth knowing: tying-in is a standing instruction, not dated visits; nothing regrows from below a hard cut; stems sharing a member are drawn side by side but not lifted over one another as in the prototype; dates are fixed provisional days of the year, with no weather.

## Stage 3 — abstract mechanical attachment into shared strategies

**Tasks:** Add independent attachment mechanism classes:

1. Stem twining (wisteria, honeysuckle, star jasmine, akebia, Thunbergia).
2. Petiole twining (clematis).
3. Tendril (grape).
4. Aerial-root attachment (ivy, climbing hydrangea, Campsis).
5. Manual scrambling/tie (rose).
6. Non-climber (Sarcococca).

Represent the glulam and its sub-lattice (lighter timber, slender cables) as one route graph that plants may use anywhere, with optional declared exclusions. Keep species-specific diameter and contact parameters uncalibrated until field evidence.

**Exit check:** Each species can approach a support, attempt a biologically correct kind of contact, fail without support, and be rescued by an explicit gardener training event where legitimate.

**Status (11 November 2026): exit check met and tested** (`packages/core/test/trial.test.ts`). `attachment.ts` decides for each of the six classes whether a stretch of timber or cable can be held unaided, needs a tie, or cannot be shown either way because the grasp limit is unmeasured; the engine uses it for every route choice. Sixteen taxa grow, every climber in the library, covering every class: the wisterias, honeysuckles, star jasmine, akebia and the annual *Thunbergia* (twining stems), four clematis (leaf stalks), the vine (tendrils), ivy, climbing hydrangea and campsis (aerial roots), the rose (tied only), with the shrub staying in its bed. Where a twiner's direction is unknown (star jasmine) it is drawn right-handed and the report says that this was assumed. In the trial on the 15 m hemisphere, untended, only the wisteria and the ivy leave the ground; each of the others stalls for its own stated reason and is led on when a gardener starts tying in. Twining has its own stem geometry (`sim/stem-path.ts`); the other climbers run along their support, which is right for stems held by leaf stalks, tendrils, rootlets or ties, though the holding organs themselves are not drawn.

## Stage 4 — implement coarse phenology and flowering-wood rules

**Tasks:** Model leaf persistence by habit, seasonal bud/flower states and pruning-sensitive growth cohorts. Begin with named seasonal windows **flagged provisional** and explicit old-wood/current-season logic. Develop optional temperature response using a clear data contract for measured thresholds.

**Exit check:** Wisteria flower outcome responds to past-season bud survival; Group 1 *C. cirrhosa* and Group 3 *C. viticella* have materially different responses to severe pruning; *Lonicera henryi* persists in winter unless exposed conditions cause damage.

**Status (11 November 2026): exit check met and tested** (`packages/core/test/mixed.test.ts`). The engine has a rule per flowering class, and each responds to pruning in its own way. *Old wood on spurs* (wisteria): cutting every stem to the ground in February removes the flower buds; the plant does not flower that year, nor much the next. *Old wood along last summer's shoots* (Group 1 *C. cirrhosa* 'Freckles'): buds form on the summer's growth and open from November to March, so the same February cut removes the flowers it is carrying, and a cut in autumn removes the whole winter's display. *Current season* (Group 3 'Étoile Violette'): the same cut every February costs no flowers, because they form on shoots that regrow from the stubs; only a cut in early summer, after the buds have formed, takes them. *Both* (*Lonicera periclymenum* 'Graham Thomas', by a provisional reading of sources that disagree): a first flush from last year's stems, which a late-winter cut-down removes, and later flowers on the new growth, which it does not (`packages/core/test/palette.test.ts`). Evergreen *Lonicera henryi* and *C. cirrhosa* keep their leaves through winter for as many seasons as their models give a leaf. Flowers along the shoots are not all decided on one day: growth made after the first buds form goes on forming them for as long as there is season left to open in, which is what gives the rose, the honeysuckles and the annual their long season. Still to do: exposure damage to evergreens, and any response to weather; all dates are fixed provisional days of the year.

## Stage 5 — add site-aware placement and multi-species scenes

**Tasks:** Input Bower shell, cardinal orientation, light/shade map, root stations, climber paths, visitor clearances and service envelopes. Add qualitative light/space/root competition. Implement `KEY.md` reference palette as **a scenario**, not a universal planting mandate.

**Exit check:** A 15-m diameter hemispherical shell checks its base-to-crown surface-path length (~11.78m) rather than vertical height (7.5m); a 4m clematis is not assumed to cover the crown; ivy reaches timber joints unaided and the run reports where.

**Status (11 November 2026): part; the exit check is met and tested** (`packages/core/test/dome.test.ts`, `palette.test.ts`). Both reference shells carry root stations, routes and viewpoints, and the vault a headroom zone. On the 15 m hemisphere three trained wisterias hold about half the routes after twelve years and none has reached the crown: route length ran out, not height. The `KEY.md` reference palette is a scenario (`referencePalette`, `npm run simulate -- palette`): one plant at the foot of each of the twelve ribs, placed by aspect as section 7 of the key sets out, with ivy as an option in place of the second evergreen honeysuckle. Its report gives the flowering calendar month by month and names the months with nothing in flower, reads winter evergreen cover against the 25–40% design target two ways (as laid out: the share of route held by plants that keep their leaves; as seen: evergreen leaf in the view from each viewpoint, and the timber it hides), and lists the timber joints that a clinging plant has reached unaided. A designed structure is read from a file of centre lines (`bower/description.ts`, `npm run simulate -- design`): elements are joined where they touch, the routes are worked out, and a cable fixed to nothing or timber no plant can reach is reported. Light is in (`packages/core/src/light/`, `sim/light.ts`, tested in `light.test.ts`). A scenario stands on a site: latitude, longitude, the bearing the drawing's y axis points to, and what stands near enough to shade it (walls, buildings, trees, declared in the `site` section of a Bower description). Where none is given, southern England is assumed and the report says so. The sun's place for any day and hour is worked out from the same declination as day length. For every stretch of route and every root station the model reads, month by month, the hours of direct sun a clear day allows and the light as a share of an open site's, shaded by the Bower's own timber and cables, by what the site declares, and by the leaf other plants carried the season before. Each plant answers through its own profile's words on sun and shade, read into the RHS's classes: one whose profile accepts nothing but full sun grows in proportion to the light it has; one that accepts partial shade is unchecked down to about two fifths of an open site's light; flowering answers to light only for the two taxa whose profiles tie flowers to sun (*Wisteria sinensis*, the rose). The design report has a light section, and flags a plant in more or less sun than its profile accepts or on a side its profile does not name.

What that shows on the reference palette, twelve years on: an open lattice casts little shade. Every station on the 15 m hemisphere has 13 to 15 hours of direct sun on a clear midsummer day, which is full sun by the RHS's definition, north side included. Routes facing north have 85% of an open site's light over the summer half of the year and 79% in December; routes facing south 89% and 93%. So the hydrangea, placed on the north side for shade, is flagged as in more sun than its profile asks for; the two clematis whose profiles ask for sun (*C. armandi*, *C. cirrhosa*) make 86% and 88% of the growth their models give; the wisterias and the rose form 84 to 90% of the flower buds; and nothing else changes. The same *C. armandi* alone at the north foot makes 2.4 m of framework in its first year against 2.6 m at the south foot and 2.75 m with light left out; by its sixth year the two have closed to within a per cent, because the length the model plans for it, not light, sets how far it goes. A 9 m wall close to the south of it holds it back by more than a tenth at six years. Aspect therefore matters to growth in this model only where a profile asks for sun or where something casts real shade. The warmth and shelter that most "south or west facing" advice is about are not modelled: there is no wind and no temperature, and the report says so for each plant whose profile asks for them.

Every number in the light model is labelled (`light/model.ts`): the RHS's hours and a measured transmission through tree crowns are published; the share of light that is diffuse, the light a class of plant needs, the proportional response and the stand-off at which light is read are provisional assumptions. Light adds about a quarter to the time a run takes. Not yet: wind, temperature or shelter; shade within one plant's own canopy; any response to too much sun (it is flagged, not acted on, there being no water in the model); cloud (the hours are those of a clear day). Plants still compete for room on a member, and now for light, by way of the leaf of the season before; root stations have no soil volume.

## Stage 6 — operationally credible gardeners

**Tasks:** Add event log, seasonal tasks, pruning/regrowth, tie ageing/adjustment, inspection, annual *Thunbergia* replacement and plant failure/replacement. Make human actions visible in the model's chronology.

**Exit check:** Two runs with identical initial conditions but different gardening calendars produce different structure, flower and maintenance outputs. A complete run can explain **which human actions caused a change**.

**Status (11 November 2026): part; the exit check is met and tested** (`packages/core/test/engine.test.ts`, `mixed.test.ts`, `annual.test.ts`). Every gardener action is a dated event in the log with what it did: stem and flower buds removed, stubs left to shoot again, plants set out. Training, the two wisteria prunes, hard pruning with regrowth, monitoring and replanting act on the plant. *Thunbergia* is set out on 20 May, makes about two metres, flowers from July into October and is killed by the cold in November; if the visit is missed, nothing grows at its station that year and the report says so. Not yet: tying-in is still a standing instruction and not dated visits; ties do not age; nothing makes a perennial fail, so replacing one has nothing to act on; watering, feeding, thinning and deadheading are recorded and have no effect; there are no hours.

## Stage 7 — evaluation and calibration plan

**Tasks:** Collect real plant and support observations from accessible prototypes and nurseries; compare attachment, shoot paths, pruning outcomes and phenology. Add credible intervals and scenario uncertainty. Calibrate taxa one at a time. Validate visuals from fixed observer positions and multiple dates.

**Exit check:** Each calibrated parameter has taxon/cultivar, context, measurement method, uncertainty and source. Unsupported parameters remain labelled assumptions; the simulator does not claim engineering reliability.

**Status (11 November 2026): not started, with one tool in place.** No parameter is calibrated: nothing has been measured on a plant. What exists is a way to see which readings depend on the unmeasured numbers (`sim/sensitivity.ts`, `npm run sensitivity`): the same scenario is run with every leaf at two and four times its area and with three times as many side shoots a year, and the winter cover, summer leaf, timber legibility and flower counts are set side by side. On the reference palette the plants that keep their leaves hold 27% of the route in mid January at every multiple, inside the 25–40% target, so the palette is laid out to the target. As seen from the approach their leaf is 1.5% of the structure's extent in the view and hides 2.5% of the timber; at the most generous multiple those read 9.1% and 13%, still under the target. The shortfall is therefore in how dense the evergreens are and in bays with nothing across them for foliage to fill, not in where the evergreens are; an earlier version of this paragraph called it a finding about the planting, which the as-laid-out reading does not support. Summer leaf cover moves from 7% to 29%, so that reading is not yet worth quoting. Since light came in, leaf area also reaches the rest of a run through the shade it casts on neighbours: with every leaf at four times its area the palette opens 697 flowers in the year against 721, and holds the same route. First to measure: leaf area carried per metre of stem, and side shoots thrown per metre of old stem each year, for each evergreen.

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
| 8 | *Hedera helix* / *Hydrangea* | Add clinging to timber, with joint-reach alerts and bounded sectors |
| 9 | *Thunbergia* / *Sarcococca* | Annual reset by gardener / ground-only companion |
| 10 | All remaining optional taxa | Palette coverage and site-specific constraints |

## Model acceptance checklist

Status on 11 November 2026 is marked on each line: done, part, or not yet.

- [x] Separate manufactured and living graphs.
- [x] Persistent plant history, with growth cohort and bud ancestry.
- [x] Model's coordinate convention, handedness, time step and units written down.
- [x] Six attachment classes (including non-climber) with correct taxon mappings.
- [ ] No attachment in a zone a project has declared off-limits; none is off-limits by default.
- [ ] Visible steel is reported, and limited to slender cables.
- [ ] Humans can train, attach, detach, prune, monitor and replant as explicit operations. *Part: train, prune (three kinds), monitor and replant act on the plant; detaching a tie is recorded but not yet acted on.*
- [x] Old-wood and current-season flowering react differently to pruning.
- [ ] Winter foliage and year-round flowering are not guaranteed merely by species label. *Part: flowers need surviving buds; evergreen leaves persist by a labelled assumption, with no exposure damage yet.*
- [x] Curved shell uses support-path length, not vertical height alone.
- [ ] Multi-species paths can be separate, overlapping or conflicting by explicit rules. *Part: plants compete for members through a stated capacity per member, and for light through the shade of the leaf a neighbour carried the season before; no root competition.*
- [x] Each numeric parameter is sourced, measured or visibly provisional.
- [ ] Outputs are interpretable by an architect, gardener and structural engineer **without claiming false physical precision**.

## Smallest valuable first deliverable

A **five-year, daily-step model** of one trained *W. sinensis* on a curved glulam Bower segment with its sub-lattice of timber and cables, visible woody-stem persistence, flowering buds that survive or are removed by gardening, dormant/leafing seasons and a readable action log. Then add one evergreen honeysuckle and one Group 3 clematis on separate routes. That produces meaningful species diversity without tackling every research problem simultaneously.
