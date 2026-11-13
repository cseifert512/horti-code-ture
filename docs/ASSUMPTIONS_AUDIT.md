# Assumptions audit — 11 November 2026

Everything the project rested on at the start of the build was tested: the prototype by running and measuring it, the specification by checking its arithmetic and internal consistency, and the botany and citations against the sources they name. This file records what held, what did not, and what was changed. It also serves as the Stage 0 model map and behaviour baseline that `DEVELOPMENT_GUIDE.md` asks for.

Reproduce the measurements:

```bash
npm run prototype:assumptions -- 7 1 42 999   # behaviour and structure of the prototype
npm run prototype:audit                        # stem / structure / stem interference
npm run check                                  # the new core's tests
```

> **Correction by the owner, later the same day.** The brief itself was wrong on one point, and this audit at first followed it. The original documents said in about twenty places that primary timber is *not* a climbing surface and that plants belong on a separate secondary support system of rods, cables and rails. That is the opposite of the design intent: **the timber is the growing surface**, steel is limited to slender cables where timber cannot give a plant a hold, and visible steel is to be minimised. The documents, the taxon data and the core have been corrected. The prototype, which grows its plant on the glulam and the timber lattice, had this right all along.

## 1. Verdicts at a glance

| Assumption | Verdict | What was done |
|---|---|---|
| Primary timber is not a climbing surface; plants need a separate secondary support system (`CONSTRAINTS` section 7, `KEY` section 5, and elsewhere) | **Wrong in the brief** (owner's correction) | Rewritten throughout: timber is the growing surface, steel only as slender cables, no rods |
| The repository is documentation only (`README`, `DEVELOPMENT_GUIDE`) | **False**: `Wisteria/` holds a working prototype | Both documents rewritten |
| The folder is a git repository connected to GitHub | **False**: no repository; the GitHub repo existed but was empty | Initialised, as-found snapshot committed first, pushed |
| The prototype builds, runs and is deterministic | **True** | — |
| The prototype twines the way *W. sinensis* does | **True** for the RHS description: right-handed everywhere (see 4.2) | Convention written down |
| The prototype is the model the specification describes, or can be extended into it | **False**: see 2.3 | New core started beside it |
| The prototype's structure comments match its geometry | **Partly false**: diagonal angle and cable spacing | Comments corrected |
| The prototype's timeline labels describe the plant | **Partly false**: "In flower" shown in years with no flowers | Fixed |
| A 15 m hemisphere needs about 11.78 m of route to the crown | **True**: pi x 7.5 / 2 = 11.781 m | Now a test |
| There are 17 candidate taxa | **True** | — |
| "Kew and RHS use *Clematis armandi*" | **True** (I expected this to be wrong; it is not) | Left alone, evidence recorded |
| Every taxon is filed under its accepted name | **False** for five, and a sixth is a trade designation | Accepted names recorded; labels kept (4.1) |
| The three cited papers exist and say what is claimed | **True**, with one scope caution (the tendril paper) | Full citations added |
| The RHS heights, time bands and hardiness ratings in the profiles are right | **True** wherever a value was given; six were blank | Blanks filled from the RHS records |
| The palette is clear of invasive-species concerns in Great Britain | **False** for two taxa: *Akebia quinata* and *Lonicera henryi* (4.4) | Flagged in `KEY.md`, the profiles and the data |
| The yearly spectacle in `KEY.md` matches the plants' seasons | **Two errors**: *W. sinensis* "early-spring", *Campsis* in June–August | Corrected |
| Twining direction is known for every twiner | **False**: unknown for *Trachelospermum*; for *L. henryi* it rests on congeners and two photographs (4.2, 4.6) | Recorded as unknown and provisional |
| The documents use one vocabulary | **False**: three evidence-status lists, two bud-state lists | One canonical vocabulary, all terms mapped |
| The yearly calendars cover the year | **False**: December missing in two documents | Fixed |
| A shoot that is on no support can be drawn along a preset curve (the prototype's whips, carried into the core) | **False**, by the owner's eye and by arithmetic: a shoot 4 mm thick does not stand 1.7 m into the air (added 12 November 2026; section 10) | Replaced by the mechanics of a rod under its own weight, for every taxon |

## 2. The prototype (`Wisteria/`)

### 2.1 Model map

| Aspect | What the prototype does | Where |
|---|---|---|
| Entities | `plants` (2, fixed stations), `shoots` (leaders and laterals to order 3), `spurs`, `whips`, `leaves`, `racemes`, plus pods and ground litter in the renderer | `skeleton.js`, `plant.js` |
| Axis representation | A stem is the line where it **touches** its support plus a unit vector away from the support: `centre = contact + away * (lift + radius)`. It thickens outward and never into what carries it. `lift` raises it over older stems it crosses. | `skeleton.js` header, `resolveCrossings` |
| Growth iteration | None. The whole life (12 growing seasons) is computed in one pass. Each point records a `birth` time; the renderer shows any instant by comparing births with the clock. | `growWisteria` |
| Routing | Shoots travel a lattice graph node to node. At each node a cost function picks the next member: upward before level before downward, empty before occupied, with capacity limits per member. | `planPath` |
| Structure | One parametric surface `S(u, v)`; ribs, a diagrid, eave beams and level cables are generated from it and double as collision solids. | `structure.js`, `collide.js` |
| Time scale | `birth` is in growing seasons since planting; calendar time is a year fraction with twelve equal months. Extension happens between year fractions 0.26 and 0.74 (about 5 April to 27 September). | `main.js` `computeState` |
| Phenology | Constants in the vertex shaders: leaf flush, raceme opening, petal fall, autumn colour and leaf fall are fixed year-fraction windows. | `shaders.js` |
| Renderer | three.js; standard materials with spliced vertex programs so radius, lift, organ scale and colour are functions of the clock on the GPU; instanced organs with per-organ level of detail. | `shaders.js`, `lod.js`, `parts.js` |
| Coordinates | three.js default: right-handed, y up, metres. | — |
| Randomness | One seeded generator (mulberry32) per plant build; deterministic. | `util.js` |
| External inputs | None. No weather, site, soil, taxon data or gardener input. | — |

**Wisteria-specific:** spur and raceme logic, raceme and compound-leaf geometry, pods, the twining handedness sign, three stems per plant twining a post, the pruning calendar, every growth and phenology constant.  
**Generic and worth keeping:** the contact-line stem representation, crossing resolution, coiling a shoot round a cable in whole turns, lattice routing with occupancy, the collision solids and the audit that measures residual interference, time-scrubbable rendering from per-point birth and death times, instanced organs with level of detail.

### 2.2 Measured behaviour (baseline)

Seeds 7, 1, 42 and 999; values are ranges across the four unless one seed is named.

| Quantity | Measured |
|---|---|
| Build time | 0.4–0.5 s |
| Determinism | Identical fingerprint for a seed within a process and across processes (seed 7: `9ff7b19e16502805`) |
| Invariants | No non-finite values; births never decrease along a stem; no lateral is older than the wood bearing it |
| Twining handedness | Trunk stems on rib legs: 6 of 6 runs right-handed. Shoots on cables: 119–120 of 119–120 runs right-handed, 2–3 turns per span |
| Vault | 5.2 m long, span 4.20–4.54 m, crown 3.20–3.49 m |
| Route versus height | Foot to crown over the surface 4.42 m against a 3.27 m crown (ratio 1.35) |
| Diagonal members | 0.55–0.64 m; inclination to the horizontal 0.5–41.8 degrees, median 22 (the header said "about 45") |
| Cable rows | 0.34–0.43 m apart, median 0.37 (the header said "about 43 cm") |
| Rib leg as a twining support | 100 x 180 mm, equivalent to a 178 mm round post |
| Extension per growing season | Leaders up to 2.7–2.9 m (median 2.1); order-1 laterals up to 2.6–2.9; order-2 up to 2.2–2.4; order-3 up to 1.6–1.8 |
| First wood at the crown | Growing season 1.7–1.9 after planting |
| Permanent framework length | About 8 m after season 1, 20 m after 2, 100 m after 4, saturating near 310–330 m from season 8 because every member reaches its stem capacity |
| What the stems touch | 4% twined round the rib legs, 56–59% lying on timber members, 36–38% on cables, under 2% unsupported |
| Trunk-stem base diameter | About 20 mm at season 3, 40 mm at season 6, 90 mm (68–114) at season 12 |
| Flowering sites | 1,091–1,159; first possible bloom in the fourth year; raceme 0.20–0.34 m; leaf 0.04–0.28 m |
| Headroom | Raceme tips over the 2.9 m walk never below 2.1 m |
| Interference (seed 7) | Stem into structure at most 0.3 mm; stem into stem at most 8.4 mm at season 12 (one point over 5 mm); one whip point 11.8 mm into the structure; 0.7% of leaf stalks touch the structure |
| In the browser | WebGL 2, no console errors, about 47 frames per second at 1.19 million triangles |

### 2.3 Where it departs from the specification

1. **No state, so nothing can intervene.** The specification needs a plant that persists and is changed by gardener events, weather and its own bud history, on a daily step. The prototype has no step and no mutable plant: a cut cannot be made, so it cannot have consequences.
2. **Pruning is cosmetic.** Summer whips carry preset death times. No pruning event exists, and nothing that is cut ever bore a bud, so the Stage 2 exit check ("a saved bud cannot bloom after its bearing shoot has been cut") is met only vacuously.
3. **Flowering is a calendar switch.** A raceme shows when the date is in a window, the wood is old enough and a hash falls under a yearly ramp. `README.md` forbids exactly this ("do not hard-code flowering months as proof of blooming").
4. **The structure is not data.** Ribs, lattice and cables exist only as one parametric surface and a set of constants inside the growth code. There is no description of members, sizes, materials or routes that another structure could be substituted for, and nothing that could report how much of a design is timber and how much is steel. (An earlier version of this audit also counted "the plant lives on the timber" as a departure. It is not: growing on the glulam is the intent, and the prototype has it right. Of its permanent framework, 4% twines the rib legs, 56–59% lies along timber members and 36–38% is on cables.)
5. **Unlabelled numbers.** Every growth rate, probability, capacity and phenology window is a bare constant (catalogued in 2.4). The specification requires each to be sourced, measured or visibly provisional.
6. **One species, one structure, hard-wired.** `growWisteria` and the `ST` constants are the model; there is no taxon data, no site and no second mechanism.
7. **Time is not dates.** Growing-season units and twelve equal months cannot be matched to weather records or a maintenance calendar.

None of this makes the prototype wrong as a visual study. It makes it a different thing from the simulator the specification describes, which is why the new core is built beside it and not on top of it.

### 2.4 The prototype's unlabelled numbers

If any of these is reused it enters the new core as `provisional_design_assumption` with "carried over from the prototype" as its basis. Dates are year fractions converted on a 365-day year.

| Group | Constant | Value |
|---|---|---|
| Extension | Leader; laterals of order 1, 2, 3; whip | 2.6; 2.4, 2.0, 1.6; 3.2 m per growing season |
| Establishment | Multiplier in seasons 1, 2, later | 0.5, 0.8, 1 |
| Growing window | Extension growth | 5 April – 27 September |
| Stems per plant | Trunk stems, with start times | 3, at −0.95, 0.15 and 1.1 seasons (the first is the nursery cane) |
| Planned length | Leader beyond the eave; laterals of order 1, 2, 3 | 5–6.5 m; 2.4–4.4, 1.2–2.6, 0.6–1.4 m |
| Branching | Chance a passed node bears a lateral, by parent order | 0.9, 0.75, 0.55; none beyond order 3 |
| Bud dormancy | Breaks the next spring; half wait a further 1–3 years; 12% break in the same season | — |
| Capacity | Stems per diagonal, cable, eave | 2, 2, 3 |
| Routing | Cost weights: occupancy 1.6 per stem; downhill 5 per metre; uphill −1.2 per metre; straight on −0.6 | Threshold 4.2 |
| Twining | Coil pitch on a cable; on a rib leg | 0.24–0.36 m; about 0.82 m |
| Thickening | Primary radius 3.6 mm; cross-section grows 2.6e-5 m2 per metre of stem beyond the point plus 0.9 of each branch's area; radius follows (age / span)^1.35 | — |
| Leaves | One per 0.075–0.11 m of stem, 0.16–0.28 m long, one season; 2–3 per spur | — |
| Spurs | Share of leaf nodes that form a spur the next season; share of spurs meant to flower | 0.62; 0.85 |
| Flowering | First bloom year; share of sites flowering in successive years after it | Year 4; 30, 55, 80, 92, 100% |
| Racemes | Length; share setting a pod | 0.26 m x 0.78–1.3; 8% |
| Pods | Swell; turn from green to brown; hang until; share of the marked racemes showing a pod in any one year; length | 10 June – 29 August; 20 September – 10 November; 6–24 February of the next year; 60%; 0.10–0.15 m |
| Whips | Share of eligible nodes each year, capped at 44; length | 2.2%; 0.9–2.0 m |
| Pruning dates | Summer cut; winter cut | 29 July – 12 August; 16–27 December |
| Leaf phenology | Flush; autumn colour; fall; bare from | 10 April – 4 June; 10 October – 24 November; 6 November – 10 December; 16 December |
| Flower phenology | Racemes lengthen; flowers open; petal fall from; gone by | 1–29 April; 18 April – 5 May; 19 May; 21 June |

The pruning dates are worth noting: the prototype's winter cut falls in late December, while the RHS guidance cited by the specification is January–February.

## 3. The specification

### 3.1 Checked and correct

- The hemisphere arithmetic (`KEY.md` section 4, `SIMULATION_KEY.md` section 9, `DEVELOPMENT_GUIDE.md` stage 5).
- The six attachment classes and their taxon assignments are consistent across `KEY.md`, `CONSTRAINTS_AND_PHENOLOGY.md` and `DEVELOPMENT_GUIDE.md`.
- The gardener event catalogue is consistent with the acceptance checklist.
- All 17 RHS plant-record URLs resolve to the plant named, and every guide URL resolves. One (`/plants/types/climbers`) returned a "temporarily unavailable" page on several attempts and loaded later the same day (4.6).

### 3.2 Corrected

| File | Was | Now |
|---|---|---|
| `README.md`, `DEVELOPMENT_GUIDE.md` | "documentation-only", "contains only documentation" | Describe the repository as it is; record fixed conventions and stage status |
| `SIMULATION_KEY.md` section 2, `CONSTRAINTS_AND_PHENOLOGY.md` section 3 | Two different single-word bud-state lists | Fate, stage and end, with both lists mapped |
| `SIMULATION_KEY.md` section 3, `SOURCES_AND_ASSUMPTIONS.md`, `README.md` | Three different evidence-status lists | Eight canonical statuses, all terms mapped, rules enforced in code |
| `SOURCES_AND_ASSUMPTIONS.md` | Three papers cited by description | Authors, volume, DOI; scope caution on the tendril paper |
| `KEY.md` section 2 | One taxonomic note | Table of working labels against RHS and Kew accepted names |
| `KEY.md` section 6, `HORTICULTURAL_INTERVENTIONS.md` section 3 | Winter was January–February; December unassigned | December–February |
| `KEY.md` section 2 | *W. sinensis* "early-spring bloom" | "Late-spring bloom" (RHS: spring and early summer; the profile and section 6 already said so) |
| `KEY.md` section 6 | *Campsis* among June–August flowers | Starts in August, continues to the first frosts (RHS: late summer and autumn) |
| `KEY.md` section 2 | No invasive-status warning on *Akebia* or *L. henryi*; *Campsis* "may need training" | Warnings added; *Campsis* weakly self-clinging, tying in needed |
| `CONSTRAINTS_AND_PHENOLOGY.md` section 2 | Handedness convention left open | Convention adopted, with a per-taxon table and confidence |
| `HORTICULTURAL_INTERVENTIONS.md` section 3 | Only wisteria and Group 3 clematis pruning scheduled | Group 1 clematis, *Campsis*, climbing hydrangea and *L. periclymenum* added |
| Six species profiles | Hardiness or time-to-size "to be confirmed" | H6 ('Étoile Violette'), H5 ('Princess Diana'), H5 and 10–20 years (ivy), H6 and 5–10 years (rose), 5–10 years (*Sarcococca*), 1–2 years (*Thunbergia*) |
| Seven species profiles | No toxicity note | RHS hazard statements for the four clematis, climbing hydrangea and *Sarcococca*; Flora of China for star jasmine |
| `species/*` | Folder names with apostrophes, a multiplication sign and an accented capital | ASCII ids |

### 3.3 Still open

- `SOURCES_AND_ASSUMPTIONS.md` lists "three wisteria root stations on a 15 m reference shell" as a preliminary concept, but no other document describes that scheme. The hemisphere generator defaults to three stations so the concept can be tested; nothing validates it.
- The 25–40% winter-evergreen target is a design hypothesis. It now has a measure (section 6), and the first reading is far below it; that reading rests on foliage densities nobody has measured.
- No grasp-diameter limit exists for any taxon. The attachment rules return `unverified` wherever the answer depends on one.

## 4. Botany and names

### 4.1 Names

Checked against RHS plant records and Kew's World Checklist of Vascular Plants (June 2026 release, read through GBIF; Kew's POWO site refuses automated access, so POWO pages were not read directly).

| Working label | Finding |
|---|---|
| *Clematis armandi* | Correct. IPNI 709497-1, Kew and RHS all use one final "i". |
| *Wisteria floribunda* 'Macrobotrys' | RHS synonym. Accepted: *W. floribunda* f. *multijuga* 'Kyushaku' (RHS 372711). The profile had the relationship backwards. |
| *Clematis viticella* 'Étoile Violette' | RHS synonym. Accepted: *Clematis* 'Étoile Violette' (Vt) (RHS 92936). |
| *Clematis cirrhosa* 'Freckles' | RHS synonym. Main record: *C. cirrhosa* var. *purpurascens* 'Freckles' (C) (RHS 89092, name status "Accepted"; record 223017, *C. cirrhosa* 'Freckles', is marked "Synonym"). |
| *Hydrangea anomala* subsp. *petiolaris* | Synonym at both RHS and Kew. Accepted: *Hydrangea petiolaris* Siebold & Zucc. (RHS 8948). |
| *Lonicera henryi* | "Correct" at the RHS; Kew treats it as a synonym of *Lonicera acuminata* Wall. The two authorities disagree. |
| *Rosa* 'The Generous Gardener' | A trade designation, not a cultivar name. RHS: *Rosa* The Generous Gardener ('Ausdrawn') (Cl). |
| The other ten | Accepted as written. |

The working labels stay in the prose and as folder ids, because they are the names the plants are bought under. Accepted names and synonyms are recorded in each `taxon.json`.

### 4.2 Twining direction

The RHS wisteria guide says Japanese wisteria twines clockwise and Chinese wisteria anticlockwise, and gives no viewpoint. Other sources supply it (seen from above). Because the same plant is called clockwise or anticlockwise depending on where the writer stands, the project records the chirality of the helix instead; the convention and the per-taxon table are in `CONSTRAINTS_AND_PHENOLOGY.md` section 2.

| Taxon | Result | Confidence |
|---|---|---|
| *Wisteria sinensis* | Right-handed (anticlockwise from above) | High. The prototype matches: every trunk and cable run it produces is right-handed. |
| *Wisteria floribunda* | Left-handed (clockwise from above) | High |
| *Lonicera periclymenum* | Left-handed | High for the geometry; no peer-reviewed species-level source |
| *Akebia quinata* | Right-handed | High. Rests on Darwin ("moves against the sun"). The University of Michigan page cited earlier says "dextrally (left to right)" of *Akebia* and of *Lonicera* alike, although the two twine in opposite senses, so its wording is not evidence of geometry. |
| *Thunbergia alata* | Right-handed | Medium to high |
| *Lonicera henryi* | Left-handed, **from the genus and two photographs** | Medium; still a provisional assumption. No written species-level source exists that could be found (4.6). |
| *Trachelospermum jasminoides* | **Unknown** | No written source after a second search; one ambiguous photograph (4.6); entered as unknown |

Contradictions exist in print for the wisterias (one guide swaps the two species; one university page contradicts itself), so observing real specimens remains on the validation list.

### 4.3 Traits

Every RHS height band, time-to-size band and hardiness rating that the profiles stated was confirmed against the live RHS record. Flowering seasons were read from the RHS description text. The RHS record has no month-by-month grid: read as raw HTML, the grid is four seasons against stem, flower, foliage and fruit. Months in `taxon.json` are therefore derived from season wording by a stated rule unless another UK source states months (4.6), and are an envelope, not a calendar.

Findings beyond the corrections already listed in 3.2:

- ***Campsis* 'Madame Galen'** flowers on the current season's growth and is only weakly self-clinging. It stays in the `aerial_root` class, with a recorded caveat that ties are needed.
- ***Trachelospermum jasminoides*** is correctly a stem twiner. Aerial rootlets on damp, rough surfaces are reported without citation; if true, they bear on the no-timber-contact policy. Unverified.
- ***Lonicera henryi*** is "evergreen" to the RHS but "winter-green or semi-deciduous" in British field accounts. Its winter cover on an exposed Bower should not be assumed.
- ***Akebia quinata*** is "semi-evergreen" to the RHS and "deciduous" in Flora of China. Expect it mostly leafless in cold winters.
- **RHS size bands versus the path classes in `KEY.md` section 4:** the rose (band 4–8 m) and star jasmine (band 8–12 m) sit in the under-4 m class there. That table is a design heuristic and was left alone, but the mismatch is worth knowing.
- **Flowering wood** was `unknown` for *Lonicera* (both), *Trachelospermum*, the rose, *Vitis*, ivy, *Akebia* and *Sarcococca*. All eight now carry a value (4.6), but only the rose's is a published statement; the other seven are inferences and are marked provisional.
- **"May–June" for the wisteria peak**: May now has a source. Bean says *W. sinensis* flowers "towards the end of May" and *W. floribunda* two or three weeks later. June still rests on the RHS wording (spring and early summer) and on that remark. Flora of China says April–May in China.

### 4.4 Legal and invasive status in Great Britain

None of the 17 taxa is on Schedule 9 of the Wildlife and Countryside Act 1981 (England and Wales) or on the list of species of special concern enforced by the Invasive Alien Species (Enforcement and Permitting) Order 2019, as those lists stood on 11 November 2026. Two need attention all the same:

- ***Akebia quinata*** — the GB Non-Native Species Secretariat's risk assessment rates it **medium risk**, and it is **under consideration for the list of species of special concern**. Listing would make it illegal to sell or plant. The Secretariat's species-of-special-concern page, read directly on 11 November 2026, names it as one of five plants (15 species) in the first cycle of the GB listing process and does not show it among the 36 listed plants. The page is current to at least September 2026, when it records a ministerial decision on de-listing; it shows no recommendation and no decision on the species under consideration. It should not be specified for a Bower without checking the current position.
- ***Lonicera henryi*** — not legally listed, but a **naturalised, bird-sown and spreading** plant in Britain (BSBI), and on the **EPPO Alert List** under the name *Lonicera acuminata*. It is the palette's core evergreen, so this is a design consideration and not a footnote: it needs containment and should be kept away from semi-natural habitat.

Elsewhere: in Scotland it is an offence to plant any non-native plant in the wild. Look-alikes that *are* listed and must not be substituted: *Rosa rugosa*, both *Parthenocissus* species, and (Northern Ireland) *Lonicera japonica*.

This is a desk check, not legal advice or an ecological assessment. `PROJECT_CONTEXT.md` already requires both for any real site.

### 4.5 What could not be checked

- Kew's POWO site refuses automated access; Kew names were read from its checklist through GBIF.
- Flora of China (efloras.org) serves a certificate that does not validate, so it was read over plain HTTP and is cited by name, not by URL, in the data.
- The Biological Flora account of *Hedera helix* (Metcalfe 2005, *Journal of Ecology* 93: 632) is behind a publisher block and was not read.

Three items listed here in the first pass were read in the follow-up and are closed: the NNSS species-of-special-concern page, the RHS page `/plants/types/climbers`, and the name status of RHS record 89092.

### 4.6 Follow-up check, later on 11 November 2026

A second pass went after the values left `unknown`. RHS pages were fetched as raw HTML this time (all 17 plant records and the guides they link to), not through a page reader; so were Trees and Shrubs Online (the text of Bean's *Trees and Shrubs Hardy in the British Isles*), the NNSS page and Darwin's *Climbing Plants*. Search snippets were used only to find pages, never as the source of a value.

**Rules applied.**

- A flowering-wood value is `published_plant_profile` only where a source states it outright for the plant or its horticultural class. Anything deduced, including the reading "pruned after flowering, therefore old wood", is `provisional_design_assumption` with its reasoning in `basis`. The reverse reading is unsafe on its own: the RHS gives ivy "any time" and the vine "midwinter" for reasons that have nothing to do with flowering wood.
- `monthsUK` stays an envelope. Where a UK source states months, it is now cited and the `basis` says which months are stated outright and which still rest on RHS season wording. An envelope was not narrowed to a single month on the strength of one line of Bean: the RHS season word still describes flowering in the other months, and too narrow an envelope is the more harmful error for a model that must never show flowers the plant could not have.
- Photographs support a provisional value at most, and the `basis` says they are photographs.

**RHS pruning groups**, from the "Pruning" field of each plant record:

| Taxon | RHS wording | Was |
|---|---|---|
| *Lonicera henryi* | pruning group 11 | not recorded |
| *L. periclymenum* 'Graham Thomas' | pruning group 11 after flowering | 11 |
| *Trachelospermum jasminoides* | pruning group 11 in early spring | not recorded |
| *Rosa* The Generous Gardener | pruning group 17 (climbing roses) | 17 |
| *Vitis coignetiae* | pruning group 11 in midwinter, and in midsummer, if restricted growth is required | not recorded |
| *Hedera helix* | pruning group 11 at any time | not recorded |
| *Akebia quinata* | pruning group 11 after flowering | not recorded |
| *Sarcococca confusa* | pruning group 8 | not recorded |

The two wisterias have no numbered group (the record says to prune twice a year and points to the wisteria guide). *Thunbergia alata* has none outdoors ("No pruning required outdoors. If grown under glass, pruning group 11").

**Flowering wood.** The RHS definition of group 11 says its members "flower on previous or current year's growth", so the group number alone settles nothing.

| Taxon | Value | Status | Rests on |
|---|---|---|---|
| *Rosa* The Generous Gardener | current season | published | BBC Gardeners' World Magazine: "Climbing roses flower on growth produced in the current year". A statement about the class. |
| *L. periclymenum* 'Graham Thomas' | both | provisional | Sources disagree. RHS honeysuckle guide and Gardens Illustrated: side shoots from the previous year's stems. Bean: "if cut back in winter will flower from June to October". |
| *Lonicera henryi* | current season | provisional | Gardens Illustrated lists it with the later-flowering species tidied in spring; the RHS guide says late-flowering types flower on current growth. Not stated for the species. |
| *Trachelospermum jasminoides* | current season | provisional | RHS: prune in early spring; Bean: flowers in July and August on short lateral twigs. NC State Extension says prune after flowering, which points the other way. |
| *Vitis coignetiae* | current season | provisional | Genus only: the RHS describes grapevine flowers on new side shoots from spurs. Nothing for the species. |
| *Hedera helix* | current season | provisional | Terminal umbels on adult shoots only (Bean), in autumn. Growth phase, not wood age, decides flowering. |
| *Akebia quinata* | previous season | provisional | RHS: prune after flowering; Flora of China: racemes axillary on short branches. |
| *Sarcococca confusa* | previous season | provisional | Flowers from late December to February, before any new growth. |

**Flowering months.** UK sources that state months were found for eight taxa:

| Taxon | Months stated | Source | Effect on `monthsUK` |
|---|---|---|---|
| *L. periclymenum* 'Graham Thomas' | June to October | Bean, supplement | Widened from Jun–Aug |
| *Hedera helix* | September to November | RHS, ivy on buildings | Unchanged; now sourced to months |
| *Trachelospermum jasminoides* | July and August | Bean | Unchanged; now sourced to months |
| *Sarcococca confusa* | late December to February | Bean | Unchanged; now sourced to months |
| *Lonicera henryi* | June | Bean | Unchanged (Jun–Aug); July and August rest on the RHS word "summer" |
| *Clematis armandi* | April | Bean | Unchanged (Mar–Apr); March rests on the RHS wording |
| *Wisteria sinensis* | May, with a second smaller crop in August | Bean | Unchanged (May–Jun); the August crop is noted, not added |
| *Wisteria floribunda* | two or three weeks after *W. sinensis* | Bean | Unchanged (May–Jun); June is not stated outright |

*Vitis coignetiae* had no months and now has June to August, from the RHS words "summer flowers". No source that states months was found for it, or for *Akebia*, *Campsis*, the three clematis cultivars, the climbing hydrangea, the rose or *Thunbergia*; those nine remain season-derived. For *Akebia* the derived value (March only, from "early spring") is probably too narrow: Flora of China gives April–May, and a dated photograph on Trees and Shrubs Online shows it in flower in North Yorkshire on 30 May 2026. It was left alone because neither is a UK statement of months.

**Management calendars** were added from RHS timing for the rose (winter prune December to February, tying in from autumn, deadheading through the flowering season, feeding in March or April and midsummer), *L. henryi* (spring tidy and spring mulch), *Trachelospermum* (early-spring thinning, yearly mulch in spring or autumn) and ivy (mid-spring trim, with the March-to-August nesting season as a constraint). For *L. henryi* the RHS record gives no timing; spring comes from the RHS guide's late-flowering type and from Gardens Illustrated, which names the species.

**Twining direction.**

- *Lonicera henryi*: no written source in English, German, Japanese or Chinese. Two photographs of identified plants on Wikimedia Commons (one in the Botanischer Garten Berlin-Dahlem, one of a stem on a metal post) each show the near side of the coil running from upper left to lower right, which is a left-handed helix. That matches the genus. The value stays provisional.
- *Trachelospermum jasminoides*: no written source in those languages or in French, Italian and Spanish search terms. Japanese references class its relative *T. asiaticum* as a root climber and give no direction. The only photograph found showing stems on canes is of a pot-grown plant with crossings in both senses. Darwin lists two twiners of the same family (*Dipladenia*) as moving against the sun, which would be right-handed, but a family is not a species. The value stays `unknown`.

**The three unread items.**

- `/plants/types/climbers` loads. It is a short introduction, not a guide: "Climbers cling on using tendrils, twining stems, stem roots or sticky pads, while wall shrubs need to be tied to supports." It names three of the project's six attachment classes (tendril, stem twining, aerial root) and sticky pads, which no plant in the palette uses, and says nothing on petiole twiners, scramblers or handedness.
- RHS record 89092: name status "Accepted". The value already in `taxon.json` was right.
- *Akebia quinata*: unchanged since the risk assessment. See 4.4.

**Still unknown or unsourced after this pass.**

- Twining direction of *Trachelospermum jasminoides*.
- A published statement of flowering wood for seven of the eight taxa above.
- Stated flowering months for nine taxa, and June for *Wisteria floribunda*.
- The outcome of the GB listing process for *Akebia quinata*.
- Every grasp diameter (3.3), which no desk check can supply.

**Noticed and not changed**, because they lie outside this pass:

- The *Campsis* calendar has the spur prune in February only; the RHS record says "late winter or early spring".
- The *Trachelospermum* management note still says "secondary wire", wording from the uncorrected brief.
- A Japanese abstract reports *T. jasminoides* var. *pubescens* climbing "with aerial roots or rotating shoots"; the paper was not read. It bears on the unverified aerial-rootlet caveat in 4.3.
- The handedness table in `CONSTRAINTS_AND_PHENOLOGY.md` section 2 and the annual cycle in `HORTICULTURAL_INTERVENTIONS.md` section 3 do not yet reflect this section.
- The 'Freckles' record itself says Cirrhosa Group clematis flower "on the previous year's growth", a more direct basis than the group 1 guide now cited.

## 5. Decisions taken in the new core

These were choices, made so that work could proceed. Each is cheap to revisit now and expensive later.

| Decision | Reason | Alternative |
|---|---|---|
| TypeScript, one language for simulation and viewer, core free of rendering code | The data contract becomes checkable types; the same core runs headless for tests and scenario batches and in the browser | Python with OpenAlea for the model plus a separate viewer |
| World frame: right-handed, metres, x east, y north, z up | Matches the architectural models Bower geometry will arrive in; sun and aspect are direct | y up, as three.js and the prototype use |
| Handedness as helix chirality | Independent of viewpoint, which the RHS wording is not | A signed "clockwise" flag with a stated viewpoint |
| Whole-day clock on ISO dates | The specification's daily step; comparable with weather and maintenance records | The prototype's growing-season units |
| Plant routes are the glulam ribs, the timber sub-lattice and slender cables; nothing is off-limits by default | The owner's design intent. The first version of the core put every route on stand-off rods and cables, following the uncorrected brief; that was reversed the same day | A project may still declare an exclusion (`contact: 'prohibited'`) for a connection or hatch |
| Visible steel is measured (`materialSummary`) | Minimising it is a stated design goal, so it has to be a number: 47 m of cable on the vault segment, 27% of plant route | — |
| Timber is treated as rough enough for aerial roots to cling to | Ivy and climbing hydrangea cling to timber in gardens; the verdict records that this rests on an assumption about the finish | Measure on the actual glulam finish |
| Folder ids from the working labels | Least surprise: the folder matches the name in the documents | Ids from the accepted names |
| Evidence status on every value, enforced | The specification's central rule, otherwise unenforceable | Convention only |
| A growth model may leave the parts a plant may or may not have `unknown` (fruit, tendrils, coiled leaf stalks, clinging rootlets, prickles, flowering side shoots); every number the plant needs in order to grow must still have a value | A run does not depend on those parts, so an honest gap costs nothing: the part is left out and the run says so. Zero, with its basis, says the plant does not have the part | A placeholder for every taxon, which is the invented number the specification forbids |
| Fruit, appendages and flowering side shoots are decided from the place they stand (`placeRng`), not from a plant's three running random streams | One more draw from a running stream moves every later decision on the plant. Decided from the place, a part can be switched on, or cut off, without moving a leaf or a flower anywhere else: the tests grow the same plant with and without each part and compare it to the last stem | A fourth running stream, which keeps the old three intact but still lets one cut move every later prickle |
| Missing fruit or appendages are reported as `part_not_modelled`, apart from `not_modelled` | Readers of `not_modelled` (the viewer's flowering calendar, four tests) take it to mean that the plant has no flowers in the run | One kind for both, and a plant with unknown pods shown as not flowering |

## 6. First readings from the new core, and how far to trust them

These come from `npm run simulate -- palette trained 12`: the `KEY.md` reference palette, one plant at the foot of each of the twelve ribs of the 15 m hemisphere, twelve years on. Every growth model behind them is a running model with placeholder numbers, so they are comparisons and prompts, not predictions.

| Question | Reading | What it rests on |
|---|---|---|
| Does the yearly spectacle in `KEY.md` section 6 hold together? | Yes, in order: winter clematis December to February, *C. armandi* March and April, wisteria in May (the peak of the year by a wide margin), hydrangea, honeysuckles, summer clematis, star jasmine and rose from June to August, the rose into October. Nothing is in flower in mid November unless ivy is planted | Fixed provisional flowering dates placed inside each taxon's RHS envelope. For the two honeysuckles and the star jasmine, which wood flowers is an inference and not a published statement (4.6); the rose's is published for climbing roses as a class |
| Is the 25–40% winter evergreen target met? | As laid out, yes; as seen, no. The key does not say what the share is of, so the report gives both readings. The five plants that keep their leaves hold 28% of the route in mid January: inside the target. Seen from the approach, their leaf is about 2% of the structure's extent in the view and hides about 2% of the timber; from inside it hides none, because the plants are on the outer face of the ribs. Ivy in place of the second evergreen honeysuckle does not change the reading as seen. With every leaf four times its area and three times the side shoots a year the approach reads 10% of the view and 13% of the timber hidden (`npm run sensitivity -- palette`): still short. An earlier version of this row said only "No" and took the denominator to be the rectangle the structure fills in the view, open bays included; that reading is kept, and is no longer the only one | Leaf counts and sizes that are placeholders. The model puts leaves only at the nodes of stems it grows, and a real evergreen climber of this age is much denser than that. Leaf area per metre of stem, measured on real plants, is the first number to collect (`DEVELOPMENT_GUIDE.md` stage 7). A design answer that does not wait for it: on the open dome a climber can only follow members, so a sector meant to read green in winter needs sub-lattice across its bays for foliage to fill |
| Does the timber stay legible? | Yes: 85% or more of the timber seen on the bare structure is still seen in July from every viewpoint | The same leaf densities; and three wisterias, not a full canopy |
| Which plants hold the glulam unaided? | Wisteria, climbing hydrangea, ivy and campsis. Every other climber has to be tied to timber and holds only the cables by itself | Grasp limits that are placeholders: 200 mm for wisteria, 60 mm or less for the rest. None has been measured |
| Which joints will clinging plants get into? | The report lists them: eight for the hydrangea, to 7.2 m | The assumption that aerial roots cling to this timber finish |

**A correction to the measuring instrument.** The coverage figures come from a small renderer at 240 by 180 pixels. Until this date it drew anything narrower than a pixel a full pixel wide, so thin stems and small leaves seen from a distance counted for several times their real area: mid-January timber visibility from the approach to the hemisphere read 70% where the corrected figure is 92%. A thing narrower than a pixel now takes a pixel with a chance equal to the share of the pixel it covers, and a test compares the result with a render at four times the resolution. Coverage figures quoted from earlier runs overstated how much the plants hide.

**Height.** A plant's reported height is now that of its permanent stems. Shoots of the year stand above them (the vine's canes by two metres), and counting them had the vine at 9.7 m on a structure that ends at 7.5 m.

**Flowers.** Until this date a plant that flowers along its shoots had its buds decided on a single day, from the growth present on that day, so anything grown later in the summer never flowered: the rose had six flowers open in mid August of its twelfth year. Growth made after the first buds form now goes on forming them. Flower counts for the rose, the honeysuckles, the clematis and the annual from earlier runs were too low. Separately, a flower whose stem was cut while it was open stayed in the render data for good; it now ends on the day of the cut.

**The vault segment's routes.** The hand-built graph of the vault segment used to carry routes on the diagrid, the eaves, the cables and the legs of the planted ribs, and none along the ribs above the eaves: it was written while the brief still kept plants off the primary timber. That is corrected. Every rib is now a route from one foot to the other, in a leg at each end and a stretch between each pair of lattice nodes on its line, and the segment has 195 m of route where it had 154 m. Read back from a description of what is built it has 193 m, so the two agree to 1%, and a test holds them within 3%. Steel cable is 27% of the route where it read 33%: the cable is the same 47 m and the timber it is measured against is all counted. In the scenarios a wisteria now has 26 to 35 m of stem wound round the ribs above the eaves after twelve years, where it had none. Trained, the two wisterias carry 152 and 162 m of framework where they carried 133 and 145 m, and open 797 and 896 flowers where they opened 698 and 811. In the mixed planting the evergreen honeysuckle reaches the crown line (3.6 m, from 3.4 m) with 43 m of framework where it had 38 m. The cost is in the report as well: the stretches where a stem of 30 mm or more is wound round timber, and will go on thickening there, rise from 4 to 8 for each trained wisteria. One consequence for comparisons: on a rib that leans with the flare of the vault, a left-handed coil takes one to three millimetres less stem than a right-handed one. Chinese and Japanese wisteria therefore build the same framework for three years and then part, as two seeds of one plant do (116 to 163 m across five seeds at eight years), where they used to stay within 5 cm of each other.

## 7. Fruit, appendages, organ forms and flowering side shoots

Added on 11 November 2026 so that each taxon can be given a faithful likeness without the engine being edited for it. Every mechanism is general and is switched on by a taxon's own `model.json`; none is switched on for any taxon but *Wisteria sinensis*, which has its pods.

### 7.1 From the prototype to the core

| Part | What the prototype does | What the core does now | Where |
|---|---|---|---|
| Fruit | Pods exist in the renderer only. 8% of racemes are marked for a pod when the plant is built; a marked raceme shows one by the calendar, in six years out of ten, from 10 June of any year after the first bloom year. Nothing ties a pod to a flower that opened | A flower that opened and went over on the plant may set, at the share its model gives. The fruit has days of its own (swelling, ripening, falling), a place on the plant's wood, and goes with that wood when it is cut. No flower, no fruit | `engine.ts` `setFruit`, `fruitDay`; `presence.ts` `fruitState`; parameters `fruit.*` |
| Tendrils, coiled leaf stalks, clinging rootlets, prickles | None: one species, which has none of them | Placed where the plant's way of holding on puts them: a tendril at the leaf nodes the taxon's pattern gives one to, holding on a stretch the shoot grasped itself; a coiled leaf stalk at leaf nodes on such stretches; patches of rootlets along them, on the side against the timber; prickles along every stem | `engine.ts` `atLeafNode`, `alongStem`; parameters `appendages.*` |
| Forms of leaf, flower and fruit | One of each, built into the geometry code | The model names them (`names` section) and the engine marks each organ: shoot, spur and side-shoot leaves; flowers of the year's growth, of the first flush and of side shoots; fruit | `model.ts` `growthNamesSchema` |
| How an inflorescence is held | Racemes hang, by a pendulum in the shader | The model says hanging, facing out or upright, for flowers and for fruit; the engine gives each one a direction, or none where it hangs | `engine.ts` `heldDirection` |
| Short flowering wood | Spurs, which are wisteria's | Spurs as before, and separately flowering side shoots: short free-standing shoots thrown by framework stems of a given age, leafy, ending in the inflorescence, living a given number of seasons | `engine.ts` `sideShootSeason`, `budsOnSideShoots`; parameters `sideShoots.*` |
| Shape numbers (leaflets, petals, sizes, colours) | Constants in `parts.js` | `species/<id>/morphology.json`, each character with its evidence status, read through `morphology.ts`. The engine does not use them; a viewer draws from them | `morphology.ts` |

### 7.2 What is assumed

These are choices built into the mechanisms, as opposed to numbers in a model file. Each is a place where a measurement or a better rule would change what is drawn.

- **Fruit set is a fixed share** of the inflorescences that go over on the plant. Pollination, weather and cultivar compatibility (`CONSTRAINTS` section 4) are not modelled. One fruit record stands for whatever one inflorescence sets: a pod, a bunch, a head of seeds.
- **Ripening and falling are windows in the year**, like the flowering dates: a fruit starts to ripen on a day drawn evenly from the ripening window and is ripe by a later day in it, then falls on a day in the next fall window. Nothing eats fruit. (When this was written a window could not cross the new year and deadheading was recorded without effect; both have changed, see section 9.)
- **A tendril holds if, and only if, the shoot took hold of that stretch by itself.** On a stretch a gardener tied, and on a shoot in the air, every tendril is there and holds nothing. Not every tendril on a real vine finds the support.
- **A leaf stalk coils** at a fixed share of the leaf nodes on stretches the plant holds itself, and nowhere else. **Rootlets** stand in patches at a spacing along such stretches. **Prickles** stand at a spacing on every stem, at any angle round it but the side against the support, hooked a little back towards the base.
- **A flowering side shoot** breaks only from a leaf node of a leader or lateral, above the clear-stem height, one to a node at a time, with the same chance at every node old enough (the model's rate for a metre of stem times the mean leaf spacing). All of a year's shoots start on the day of bud break and reach their length by the day the first flowers of the year could open. One that lives more than a season neither lengthens nor branches afterwards; it comes into leaf again each year, and may flower again. It is shed on the day of bud break after its last year. Its leaves are spaced and sized by the same parameters as the plant's other leaves, whatever their form. (Both are now the default and no longer the only way: a model may have its side shoots grow on, and give their leaf its own numbers, see section 9. They still do not branch.)
- **Its flower bud** forms on the day the plant's other flower buds form, and opens in the next flowering window after that day: the same year for a plant that flowers later than its buds form, the next year for one that flowers earlier. Flowering wood class is not consulted beyond that; a plant whose flowering wood is unknown flowers nowhere.
- **Directions** are built from the stem's own line and its direction away from the support with fixed weights (an upright flower leans a quarter off the support; a flower facing out is tipped a third upwards). They are drawing geometry, not measurements.
- **Stem thickness is not known at an organ's place.** A leaf, flower, fruit or appendage is placed on the line where its stem touches its support, as leaves always were; a viewer that wants it on the surface of a thick stem has to find the stem.

### 7.3 Wisteria sinensis pods

The share that sets (8%), the swelling time and the ripening and fall windows are the prototype's, carried over and labelled as such (2.4). The pod's length, 5 or 6 inches, is Bean's and is the one published number. That the pods hang is assumed. In the reference run (`npm run simulate`, two plants on the vault segment, trained, ten years) 380 pods set from 4,880 racemes, the first in 2031; 111 hang on the plants in mid December of the tenth year, and each year's are down by the end of February. None of this has been watched on a plant.

### 7.4 What a run now says about gaps

A plant whose model leaves any `fruit.*` number unknown sets no fruit, and the run says so once on planting day (`part_not_modelled`); so does a plant whose way of climbing has an appendage (a tendril climber, a leaf-stalk climber, a clinger, a scrambler) and whose model gives no numbers for it. Fifteen of the sixteen growth models are in that state on this date, so a mixed run lists one or two such lines for every plant that is not *Wisteria sinensis*. Unknown side-shoot numbers are not reported: most climbers make none, and a line for each would say nothing.

## 8. Light and aspect: what was added, and what it rests on

Added later on 11 November 2026. Until then aspect changed nothing in a run. It now does, through light alone.

**What is computed.** For each stretch of route and each root station, and for the 15th of each month: the hours of direct sun a clear day allows, and the light received as a share of what an open site at the same spot would have (direct beam weighted by its clear-sky strength through the day, and light from the whole sky, mixed in a stated proportion). Shade comes from the Bower's own members and cables, from walls, buildings and trees a description declares in its `site` section, and from the leaf other plants carried the season before. Light is read a little way off the face a route lies on, on a small sphere, so that low light from one side counts as much as light from above.

**What is published.** The RHS's definitions of full sun (more than six hours of direct sun a day at midsummer), partial shade (three to six), moderate shade (two or three) and deep shade (fewer than two): https://www.rhs.org.uk/garden-design/shade-gardening. These are the words the taxon profiles use, so a place is classed by its midsummer hours and compared with the classes a profile names. Direct sun through the crown of a single tree, 1.3 to 5.3% in leaf and 40.2 to 51.9% bare, from measurements on street trees in Gothenburg (Konarska et al. 2014, https://doi.org/10.1007/s00704-013-1000-3); the middle of each range is used, and using the in-leaf figure all year for an evergreen tree is this project's reading, not the paper's. The sun's position, the equation of time and the clear-sky beam are textbook approximations, good to about a degree.

**What is assumed, each labelled `provisional_design_assumption` in `packages/core/src/light/model.ts`.**

| Assumption | Value | Why it matters |
|---|---|---|
| Share of light that is diffuse | 0.55 | Sets how much a place that loses its direct sun still has. A round figure for southern England's cloud; a site should give its own. |
| Light needed by a plant whose profile accepts only full sun | all of an open site's | Makes such a plant's growth fall in proportion to any shade at all. This is the assumption that makes north differ from south on an open lattice. With it set at the light of a place that only just counts as full sun, nothing on the reference shells would be held back. |
| Light needed where a profile accepts partial shade | 0.4 of an open site's | Below it growth falls in proportion. Nothing on the open reference shells comes near it. |
| Light needed where a profile accepts shade | 0.15 | The same, for ivy and the shrub. |
| Flowering where a profile ties flowers to sun | in proportion to light | Applied to *Wisteria sinensis* and the rose only: the two profiles that say so. |
| Leaf as shade | half its area in the way from any direction | The neutral assumption of canopy light models. Leaf area itself is the unmeasured stand-in of the coverage figures. |
| Where light is read | 0.15 m off the face of the member; 0.5 m above a root station | Sampling choices. |
| Months a declared deciduous tree is in leaf | May to October | A round figure; a description cannot yet say what kind of tree it is. |

**The reading of the profiles is itself an interpretation.** `taxon.json` records light, aspect and shelter as one sentence (`site.aspect`). `light/tolerance.ts` reads the classes, the compass quarters and the shelter it names, and nothing else; a test checks that all seventeen sentences can be read. The reading carries the status of an assumption, with the sentence as its basis.

**What the taxon files do not hold, and the light model would use.** A structured, sourced statement of the light classes each taxon accepts, in place of a sentence to be parsed. Whether an aspect is asked for light, for warmth or for shelter: the sentences run them together ("south or west facing, sheltered"), and only light is modelled. Any figure for how much growth or flowering falls with shade, for any taxon: the profiles give a direction at most. What too much sun does, and on what condition (the hydrangea: "full sun only where the soil stays moist"). Winter light needs of the evergreens. For *Campsis*, that it is heat and not light that its flowering answers to is in the sentence, and there is no heat in the model.

**Findings.** On an open lattice in an open site every station is in full sun by the RHS's definition: the 15 m hemisphere's north stations have about 14 hours of direct sun on a clear midsummer day. The north side has 85% of an open site's light over the summer half of the year and 79% in December; the south side 89% and 93%. The reference palette puts the climbing hydrangea on the north side for shade, and it is not in shade there: the report flags it. The difference aspect makes to growth is confined to the taxa whose profiles ask for sun, and is of the order of a tenth in the early years.

**Not verified.** None of the light figures has been compared with a measurement on a structure. The shares assume a flat horizon and no cloud. Shade from foliage rests on leaf areas that are stand-ins. The response to light has not been compared with any plant.

## 9. Leaf forms, leaves kept through winter, flowering again, dates through the new year, side shoots that grow on

Added on 12 November 2026, while each taxon was being given its own numbers, for five things those numbers could not yet say. Each is general, is switched on by a taxon's `model.json` alone, and is off for every taxon on this date: no species file was changed. The tests are in `packages/core/test/habits.test.ts`.

### 9.1 What was there already

| Asked for | Found in the engine before anything was written |
|---|---|
| Leaf size, spacing and lifespan by leaf form | The three forms could be named apart (`names.leafForm`, `spurLeafForm`, `sideShootLeafForm`) and every leaf carried its name. All three shared `organs.leafLengthM`; a spur's leaf was that length times 0.9, a number of the prototype's written into the engine and into no model file. A spur had its own leaf count (`organs.spurLeafCount`). A side shoot's leaves were spaced, paired and sized as the plant's other leaves, and were in leaf every year the shoot lived whatever `organs.leafLifespanYears` said |
| Semi-evergreen | In the vocabulary and in one profile (*Akebia quinata*). The engine asked only whether the habit was `evergreen`, so a semi-evergreen plant was deciduous, and nothing said so |
| Repeat flowering | Nothing. A place flowered once a year. Growth made after the first buds formed went on forming buds, which gives a long season on a plant that keeps growing and is not the same thing. `deadhead_or_select_flowers` was in the vocabulary and was recorded without effect |
| Windows across the new year | Refused by the model schema. One half of it was there: a petal fall whose first day is earlier in the year than the opening's first day was read as next year's, and a fruit ripened or fell in "the first window to end after" a day, which may be next year's. So a display could end after the new year and could not open after it |
| Side shoots that grow on | Nothing: a side shoot made its length in its first season and kept it |

**How *Clematis cirrhosa* 'Freckles' was made to flower in winter.** Its model gives an opening window of days 320 to 350 (16 November to 16 December), which stops short of the new year because it had to; no length of life for a flower (`phenology.flowerLastsDays` of 0); and a petal fall of days 45 to 80, which the engine reads as the following year's because it begins earlier in the year than the opening does. So nothing opens in January or February, and what opened in November stays open for about three months. The numbers were not changed, and the run is the same as it was (9.4). The honest form is now sayable: an opening window of `[320, 45]` with flowers that each last some weeks. A test grows the plant both ways.

### 9.2 What was added

| Mechanism | A model switches it on with | What the engine then does | Where |
|---|---|---|---|
| A spur's leaf | `organs.spurLeafLengthM` | Draws each spur leaf's length from it. Unknown: 0.9 of `organs.leafLengthM`, as before | `engine.ts` `spurLeaves` |
| A flowering side shoot's leaf | any of `organs.sideShootLeafLengthM`, `organs.sideShootLeafSpacingM`, `organs.sideShootLeavesPerNode`, `organs.sideShootLeafLifespanYears` | Uses each in place of the ordinary leaf's number. With a lifespan, a leaf lasts that many seasons from the year its stretch of the shoot was made; without, the shoot is in leaf along its whole length every year it lives, as before | `sideShootLeaf`, `sideShootLeaves` |
| Leaves kept through winter | `organs.winterLeafShare`, 0 to 1 | Decides for each new leaf whether it is kept. On a plant whose profile is not evergreen, a kept leaf is marked as one that stays on in winter, lasts into the spring after its season, and is shed on a day of its own in that spring's leaf flush. On an evergreen, a leaf that is not kept falls in the leaf fall of its first year | `winterFate`; shed in `step` |
| Flowering again | `flowering.repeatMaxPerSeason`, `flowering.repeatIntervalDays`, `flowering.repeatShare`, all three | When a flower at a node of a shoot or at the end of a side shoot goes over, a share of them are followed by another at the same place after the interval, if it would still open inside the flowering window; and so on, up to the count | `flowerAgain` |
| Deadheading | `flowering.repeatIntervalDeadheadedDays`, with the three above | A `deadhead_or_select_flowers` event takes the spent flowers of the season, with any unripe fruit behind them, and brings each next flower forward to that interval after the visit, or lets in one whose own wait would have run past the window. Without the number the event is recorded only, as before | `deadhead` |
| Dates through the new year | a window whose first day is later than its last: `[320, 45]` | Reads it as running from the first day to the last day of the following year, wherever a window is read | `sim/windows.ts`, and every reader below |
| Side shoots that grow on | `sideShoots.extensionMPerYear` and `sideShoots.maxLengthM`, both | At bud break each living side shoot of an earlier year sets off again along the line it ended on, by a length drawn from the first, up to the second | `sideShootSeason` |

**Every place a window is read**, and what "through the new year" means there:

| Read by | Window | Through the new year |
|---|---|---|
| `startSeason` (a spur's bud waking) | `flowerOpenDoy`, `petalFallDoy` | Opens in the window that begins in the flowering year. The petal fall follows by the same rule as elsewhere |
| `budsAlongShoots`, `lateBud`, `budsOnSideShoots` | `flowerOpenDoy`, `petalFallDoy` | The window that begins in the year the buds form (or the next, where its first day has passed) is counted on past 31 December. A flower's year is the year its window began |
| `flowerAgain`, `deadhead` | `flowerOpenDoy` | The end of the window the first flower's season opened in |
| `setFruit` | `fruit.ripenDoy`, `fruit.fallDoy` | The first occurrence of the window to end after the day in question, which may be one already in progress |
| `render-data.ts` seasons | `leafFlushDoy`, `autumnColourDoy`, `leafFallDoy` | A flush began the year before; a colouring and a fall end the year after. The season entry of a year carries the fall that ran into it and the flush that begins in it |
| `presence.ts` `leafState` | the same, from the data | Last year's leaves go on dropping in January, each on its own day; a place that comes into leaf every year is opening in December |
| `winterFate` | `leafFlushDoy` | A kept leaf is shed in the flush that ends in the spring after its season |
| `light.ts` `canopy` | `leafFlushDoy`, `leafFallDoy` | Their middles, taken on the side the window runs over |
| `dayForPlant` | last day of `leafFallDoy` and of `floralInitiationDoy` | A single day of the year, whichever year it falls in: nothing to change |

The growing season, `phenology.budburstDoy` to `phenology.growthEndDoy`, is two single days and not a window, and cannot cross the new year: growth, wood age, leaf years and the yearly account are all counted by calendar year. A plant that grows through the winter cannot be said yet.

### 9.3 What is assumed

Choices built into the mechanisms, as opposed to numbers in a model file.

- **A kept leaf is chosen by place and by nothing else**: not by height, exposure, age of wood or the winter in question, and the same leaf positions on a spur or a side shoot are kept every winter. The specification says leaf retention is climate-dependent (`CONSTRAINTS` section 5); there is no weather here, so the share is one number for a taxon in a scenario. To show *Lonicera henryi* in exposure, vary its model for that scenario.
- **A kept leaf stays green and is counted as evergreen leaf** for as long as it is out, in the coverage figures and in the light other plants receive. The winter check's "as seen" reading therefore includes a semi-evergreen plant's kept leaves; its "as laid out" reading still counts only plants whose profile says evergreen.
- **An evergreen that is given a share below one drops the rest in its first leaf fall**, turning as a deciduous leaf does by `phenology.autumnColourDoy`. Whether such leaves colour is the look's business.
- **The next flower stands exactly where the last one did.** On a rose the next flush comes from a new shoot below the spent one; that shoot is not grown. A flower at the end of a side shoot is followed at the end of the same shoot.
- **Whether a flower is followed is a fixed share**, the same in every flush and whether or not it set fruit or was deadheaded. Deadheading changes when the next flower comes, and saves one that would have come too late; it does not make a place flower that chance had left.
- **A flower that follows lasts** as `phenology.flowerLastsDays` says or, where the model has the whole display fall together, as long as the one before it did.
- **Deadheading takes every spent flower of the season at one visit**, and every unripe fruit behind one, whatever the plant's size or height. Fruit that has begun to ripen is left. Nothing is cut: no stem is shortened.
- **A spur's flower is never followed**, nor one on a shoot cut back to short wood. An occasional second flush on wisteria is not modelled.
- **A side shoot grows on in a straight continuation**, turning up a little as in its first year, by an amount that does not depend on its age, its light beyond the plant's own factor, or whether it flowered. It finishes by the day the first flowers of the year could open, as a new shoot does. It still does not branch. A flower at its end opens at the new end; fruit is decided from the place its flower stood, so which of those flowers set can differ from a run in which the shoots stayed short, while their number is the same.
- **Leaf spacing finer than the 4 cm between stored stem points** gives a leaf at every point: true of every leaf in the engine, and now reachable from a side shoot's own spacing.
- **A leaf flush through the new year belongs to the year it ends in; a colouring, a leaf fall and a flower opening to the year they begin in.** These are the readings under which a calendar-year growing season still makes sense.

### 9.4 What did not change

With every mechanism off, which is every taxon on this date, ten runs were compared with and without the change, against main at 59aa99c, at 4d29927 after five researched taxa had been merged, at fae1f7c and at e29e9af: wisteria on the vault trained and untended, the mixed planting both ways, the reference palette both ways and with ivy, the attachment trial both ways, and wisteria on the hemisphere, ten years each. Stems, leaves, flowers, fruit, appendages, seasons, events, yearly summaries, the decision trace and the design report are identical to the byte, with one exception: each taxon's tally of unknown parameters is higher by twelve, the twelve new ones, in the render data's `assumptions` and in the report's last section. *Wisteria sinensis*, whose model gave every parameter, now reads 12 unknown; two tests that required it to give every parameter now allow it to leave out what any model may.

A semi-evergreen plant whose model gives no share now says so once in the trace (`part_not_modelled`). No reference scenario plants one.

**One thing a taxon's own test may trip on.** A model file that gave every parameter when it was written does not give these twelve, and they are read as unknown. A test that asks of a parsed model that no parameter be unknown therefore fails until the file says something for each: a number, or zero where the plant does not do the thing. That of *Clematis viticella* 'Étoile Violette' was one such; on main it now asks it of the parameters the file itself gives (e29e9af), which is the form such a test should take. What each taxon does about the twelve is still open for every taxon.

### 9.5 Not done, and not verified

- No number for any taxon. Shares kept, intervals between flushes, lengths added a year and the leaf sizes of spurs and side shoots are for the taxon files, with their sources.
- The 0.9 that sizes a spur's leaf where a model gives none is still in the engine. *Wisteria sinensis* could carry it as a labelled number; it was left alone so that its runs stay identical.
- Nothing here has been compared with a plant.
- The viewer was not changed. Two of the five were looked at through it as it stands (`npm run portrait`, with a number put into a taxon's model for the picture and taken out again, never committed): *Akebia quinata* on 15 January of its sixth year, bare with no share and thinly in leaf along its stems with a share of 0.3; and the climbing hydrangea in June of its ninth year, with the same 325 stems and 74 flowerheads either way and 10,116 leaves where it had 7,038 once its side shoots add 10 to 20 cm a year up to 1.2 m. Flowering again, a leaf fall in January and a flush in December have been through `presence.ts` in tests and not through a picture.

## 10. Shoots in the air: their weight, the light, and a hold within reach

Added 12 November 2026, after the owner looked at the renders: "I see a bunch of shoots growing huge amounts into empty space that would just... never occur. Gravity and sun are still very much factors."

**What was there.** A shoot that is on no support (a long shoot of the year, a flowering side shoot) was grown as the prototype drew its whips (section 2.1): along its heading, with a little random wander and a droop that depended on nothing but the share of its planned length it had made. The same curve served a wisteria shoot with eleven leaflets to the leaf and a honeysuckle's. Measured on `main` before the change, seed 7: on the vault left untended for ten years the wisteria's shoots stood up to 1.70 m above the point they left the timber and reached 1.65 m out from it; none ever took hold of anything, because nothing in the engine let a shoot in the air do so.

**What replaced it** is in `SIMULATION_KEY.md` section 4.3, "Unsupported shoots", clause by clause, and in the heading of `packages/core/src/sim/free-shoot.ts`. In one sentence: a shoot in the air is a rod fixed at its base, bent by its own weight and that of what it carries, steered towards up and the light while it can hold itself up, stopped by the ground and turned by the timber, and able to take hold of a support it comes within reach of.

**What is published and was used.**

| Source | What was taken from it |
|---|---|
| Hattermann, Petit-Bagnard, Heinz, Heuret, Rowe 2022, *Mind the gap: reach and mechanical diversity of searcher shoots in climbing plants*, Frontiers in Forests and Global Change 5:836247, https://doi.org/10.3389/ffgc.2022.836247 | Reach (straight line, base to apex, of the longest searcher that still held itself between upright and level) of 29 climbers: 0.105 to 2.68 m, about half the species up to 1 m; stem twiners 0.10 to 2.25 m, tendril climbers and the one root climber 0.14 to 0.91 m, hook and scrambling climbers 0.72 to 2.68 m. Stiffness in bending at the searcher's base: 213 to 15 479 MN/m2, about 3000 needed to span more than about 0.8 m. That searchers which find nothing commonly flop and hang. Its species include *Lonicera japonica*, *Clematis vitalba*, *Vitis vinifera*, *Trachelospermum jasminoides* and *Hedera helix*; the page as read gives no figure for any one of them, only the extremes and the ranges by group. |
| Vecchiato, Hattermann, Rowe and others 2023, PLoS Computational Biology 19:e1011538, https://doi.org/10.1371/journal.pcbi.1011538 | *Trachelospermum jasminoides* searchers reach about 1.1 m; stiffness at their base about 3000 MN/m2 (the page as read prints the unit as N/m2, which cannot be meant). |
| Isnard, Rowe, Speck 2003, Annals of Botany 91:407-417, https://doi.org/10.1093/aob/mcg044 | *Clematis flammula* var. *maritima*: 1619 ± 492 MN/m2 in its aerial shoots, falling to 470 in old underground stems. Read from the abstract. |
| Chelakkot, Mahadevan 2017, *On the growth and form of shoots*, J. R. Soc. Interface 14:20170001, https://doi.org/10.1098/rsif.2017.0001 | The form of the model: a growing shoot as an elastic rod that sags under its weight and stiffens with age; a fresh density of about 1000 kg/m3. |
| Greenhill 1881, Proc. Cambridge Philosophical Society 4:65-73 | The height at which an upright rod buckles under its own weight, 1.986 (EI/w)^(1/3). A test, not a parameter. |
| Darwin 1875, *The Movements and Habits of Climbing Plants*, https://www.gutenberg.org/ebooks/2485 | That a shoot which outgrows its support sinks under its own weight; the sweep of a revolving hop shoot (19 inches across) and of Ceropegia (more than 5 feet); the times of revolution of wisteria shoots. |

**What is assumed.** Eleven numbers, in `packages/core/src/sim/generic-shoot.ts`, every one `provisional_design_assumption`: none has been measured on any plant in the library. A taxon replaces any of them in its `model.json`; *Wisteria sinensis* has entries of its own, which differ from the generic ones only for the weight of a raceme and of a pod (the pod worked out from Bean's dimensions), because nothing was found measured on wisteria.

| Parameter | Generic value | Where it comes from | What it decides |
|---|---|---|---|
| `mechanics.woodModulusMPa` | 3000 | Hattermann et al.: a reading across species | How far a shoot stands before it arches. The reach goes as its cube root |
| `mechanics.greenShootModulusMPa` | 300 | No measurement found; near the least stiff searcher base measured | How soon the growing end nods |
| `mechanics.woodSetDays` | 30 | No measurement found; a round figure | How much of a fast shoot is still soft |
| `mechanics.stemFreshDensityKgM3` | 1000 | The figure Chelakkot and Mahadevan take | The stem's own weight |
| `mechanics.leafFreshMassPerAreaKgM2` | 0.2 | Not weighed: a sheet of water a fifth of a millimetre thick | Most of what a leafy shoot carries: on a wisteria shoot the leaves weigh more than twice the stem |
| `mechanics.inflorescenceFreshMassKg` | 0.01 | Not weighed | Little: few shoots flower while they are still growing in the air |
| `mechanics.fruitFreshMassKg` | 0.01 | Not weighed | Less still |
| `mechanics.searcherReachM` | 1.0 | Hattermann et al.: about half of 29 species reach up to 1 m | Where a shoot that still holds itself up stops |
| `tropism.turnPerM` | 1.5 rad/m | Chosen | Whether shoots stand plumb (a large value) or lean and arch (a small one) |
| `tropism.lightShare` | 0.5 | Chosen | How far a shoot leans to the light |
| `attachment.graspReachM` | 0.12 m | Half the radius of the hop's sweep in Darwin | How wide a gap a shoot crosses |

The radius of a shoot of the year is not one of the eleven: it is `thickening.tipRadiusSquaredMm2`, which every growth model carries over from the prototype as 4 mm2, a shoot 4 mm thick, for a wisteria and for a clematis alike. The stiffness of a rod goes as the fourth power of its radius, so this stand-in decides more than any of the eleven. With it, the generic shoot of a taxon with small leaves holds itself out for about a metre, which is where the published reach stops it; a clematis shoot is not 4 mm thick.

**Which way the light is.** Asked of the light model of section 8 (`LightField.from`): the sky as seen from the nearest place the model reads light at, within 1.5 m, in the month of midsummer, behind the timber, what the site declares and last season's leaf of the other plants. Where the model has no reading near, or is told not to act, the open sky of the site is taken: straight up for the share of light that is diffuse and from the sun's side for the rest, which in southern England at midsummer is a lean of a few degrees to the south. On the reference structures every asking was answered by the light model.

**Findings, seed 7.**

| | Before | After |
|---|---|---|
| Wisteria on the vault, untended, ten years: highest a shoot stands above where it left the timber | 1.70 m | 0.94 m |
| The same: furthest out sideways | 1.65 m | 1.29 m |
| The same: shoots that took hold of a member or cable from the air | 0 of 228 | 61 of 225 |
| Wisteria on the specimen frame, untended, six years: highest above base, furthest out | 1.38 m, 1.61 m | 0.89 m, 1.32 m |
| *Lonicera henryi* on the specimen frame, trained: highest above base, deepest below it | 0.40 m, 0.41 m | 0.42 m, 0.30 m |
| The rose on the specimen frame, trained: highest above base, deepest below it | 0.42 m, 0.17 m | 0.46 m, 0.00 m |

The short shoots of the honeysuckle and the rose (0.2 to 0.5 m in their models, and 4 mm thick) hardly bend under the mechanics: a rod of that thickness and length holds itself. The old curve made them droop more than their weight does. Their pictures change little; the wisteria's and the vine's change a great deal.

**The framework is untouched.** In the wisteria reference scenario (two plants on the vault, twelve years) the framework is the same as on `main` to the micrometre, trained and untended: 151.827683 m and 162.356677 m of leaders and laterals trained, 165.122394 m and 153.241389 m untended, the same members in the same order, the same height reached. This holds because the mechanics draw nothing from the random stream that routes the framework, and because a hold taken from the air does not use up the framework's room (clause (f)). What moves: trained, 28 shoots of the year took hold in twelve years and every one went with the summer and winter cuts, spurs and flowers moved by one to three in a hundred (661 and 756 flowers in the last year against 643 and 768), and the route held is the same. Untended, 68 shoots took hold, 35 still held at the end (the rest gave up their place to framework), the route held rose from 50.7% and 45.9% to 53.1% and 46.8%, shoots of the year were 5% shorter in all, and flowers 6% and 8% fewer (279 and 270 against 296 and 293). Those movements in spurs and flowers are the order of the plant's random numbers shifting, since a shoot that stops early or takes hold makes fewer or more leaves; they are not a finding about flowering.

**Cost.** A run takes about a third longer: each length laid in the air is a rod to be solved.

**What is still wrong, or not looked at.**

- *As grown.* A real shoot bends along its whole length as it grows heavier; here what is laid stays. The drawn shoot keeps its arch near the base and so stands a little higher and further out than an elastic rod of the same final length would hang.
- *A shoot stops at its reach.* A shoot that still holds itself up at the published reach simply grows no further. A real one would more likely grow on, flop and hang. Stopping keeps the bound honest with one number; it also leaves a population of shoots ending at exactly that distance.
- *Old shoots stay for ever.* An untended plant keeps every shoot of every year, bare after their first season. No source was found for when a searcher that found nothing dies back, so none does.
- *Leaves weigh at once.* Many twiners keep the leaves of a searching shoot small until it has a hold (Hattermann et al.). Here a leaf weighs its full weight from the day it is laid, which makes shoots droop sooner than those plants' do.
- *The timber test is round.* A rectangular member is a round bar of the same perimeter; shoots are not tested against one another or against other plants; a spur is still the short drawn curve the prototype gave it and can pass through a member.
- *A leader that runs out of route still stops.* It does not set out into the air as a searcher, so the framework itself never crosses a gap; only shoots of the year do, and they are not framework.
- *Wind* is not a load, nor rain, nor snow.

**Not verified.** No shape drawn here has been compared with a shoot on a plant. None of the eleven numbers is this library's taxa's own. The published reaches and stiffnesses were read from the papers' text and abstracts as fetched; the per-species tables of Hattermann et al. were not reached, so no taxon here has been given the figure of its nearest relative in that study. Putz 1984 (Ecology 65:1713-1724), which later papers cite for reaches of up to 3 m in tropical lianas, could not be read.

## 11. How a side shoot leaves its stem, and a climbing rose's routine of care

Added 12 November 2026, after the owner looked at the top of the vault in winter: "Would this happen in real-life?? I'm inclined to think not tbh." Along the timbers stood a comb of thin, dead-straight, near-vertical side shoots of *Rosa* 'The Generous Gardener', evenly spaced and alike, several ending in one hip. The climbing hydrangea showed the same comb.

**Why it was drawn so.** Every side shoot set out straight away from what its stem lay on, with a little random spread: on a level member, straight up for all of them. All broke on the day of bud burst, at lengths from one range. The rose's spray and hips weighed the generic 10 g, and the rose had no routine of care: a trained rose was tied in and never pruned or deadheaded, so in January every shoot of the summer still stood with its hip.

**What a side shoot now does** (`sideShootHeading` and `sideShootSeason` in `sim/engine.ts`, for every taxon with side shoots). Its place round the bearing stem follows the turn of the leaves from node to node: a right angle from pair to pair where leaves are opposite, the taxon's divergence (or the generic 137.5 degrees) where they stand singly. A place on the side pressed against the support is folded round to the open side. It leans forward along the bearing stem at an angle drawn from a range, and is turned a quarter of the way towards the direction a shoot of the plant seeks (up and the light). It never starts into the support. Its bud breaks on a day of its own in the four weeks after bud burst, and it grows so as to have its length when the first flowers open. As it is laid it is as thick as the length it is still to make: 6 mm at the foot of the rose's longest, tapering to the tip. From there the mechanics of section 10 lay it, so it arches towards the light and bows where it carries a spray or hips. Everything is drawn from a stream of the place (`placeRng`), so nothing else on the plant moves.

**New numbers**, all optional (`GROWTH_PARAMS_OPTIONAL`); where a model gives none the generic side shoot in `sim/generic-shoot.ts` is used and the run says so once for the plant (a `generic_shoot` decision). None has a source; each is a labelled choice.

| Parameter | Generic value | What it decides |
|---|---|---|
| `sideShoots.branchAngleDeg` | 35 to 70 degrees | How far a shoot leans out from its stem |
| `sideShoots.breakSpreadDays` | 0 to 28 days after bud burst | When each bud breaks |
| `sideShoots.startTowardsLight` | 0.25 | How far the first heading is turned towards up and the light |
| `organs.alternateDivergenceDeg` | 137.5 degrees | Where round the stem successive single nodes stand |
| `sideShoots.baseDiameterMm` | none: the plant's own pipe model on the length to come | How sturdy the foot of a side shoot is |
| `flowering.firstFlushDays` | none: the whole flowering window | When the first flowers at the ends of side shoots open, for a plant that flowers in flushes |

**The rose's numbers**, each in `species/rosa-the-generous-gardener/model.json` with its basis: a spray 12 g and a cluster of hips 12 g, worked out from whole flowers of small diploid roses (Rawandoozi and others 2023) and dog-rose hips (Sindrak and others 2012), not weighed; a side shoot 6 mm thick at its foot, not measured; repeat flowering at last switched on, a June flush (`firstFlushDays` 0 to 24), up to three more (`repeatMaxPerSeason`), half the places each time (`repeatShare` 0.5), two to four weeks after a deadheading and four to six after a spray left on the plant, from a nursery's "five to six weeks between flushes" read as opening to opening. No stiffness, density or leaf weight of a rose was found, so those stay generic.

**A new gardener event, `shorten_side_shoots`** (in `vocab.ts`, mapped to the RHS's pruning of climbing roses). Each side shoot that has flowered is cut back to a share of its length drawn for it from its place; what stood beyond the cut goes with it (leaves, spent spray, hips, prickles, any shoot it bore). The stub is not shed in spring: that node's next side shoot breaks from its top, and where the stubs of earlier winters would carry it further out than the plant's longest side shoot, the cut goes back to the first stub. With `renewCanes`, where more canes rise from the base than are kept, the oldest are cut down low and shoot again. The rose's routine (`climbingRoseRoutine`, in `MODELLED_ROUTINE` and the reference palette): 8 January, keep a third to a half (RHS: "back by two thirds"; the breeder: "by around half"), at most six canes; deadheading on 28 June, 12 and 26 July, 9 and 23 August, then left so the last flush sets hips (the breeder: "Do not deadhead roses renowned for their autumn fruit after the second flush"). Sources and quotations are in the rose's `SPECIES_PROFILE.md`, "Care: what the gardener does".

**What one year of the log says** (the rose on the specimen frame, 2031, as the viewer grows it): 8 January, "winter pruning: 105 flowered side shoots cut back, each keeping 33% to 50% of its length; 25.2 m of shoot and 24 hips went with the cuts; 21 side shoots that had not flowered left as they were; 5 canes from the base, no more than the 6 kept: none taken out"; 28 June, 13 spent flowers taken off; 12 July, 63; 26 July, 67; 9 August, 3; 23 August, 20, each with the places that will flower again sooner for it. In 2032 the plant opened 409 sprays (241 the year before, when the plant was younger), 92 in flower on 15 June, 177 on 1 July, then 40 to 80 at a time through August and 20 to 32 into October.

**A fault found on the way and mended.** The light a shoot reads (`LightField.from`) took the nearest reading point for a quarter-metre cell from wherever the first shoot to ask from that cell stood, and kept it. So the light a shoot turned to depended on which shoot had asked first, and side shoots breaking on other days moved a whip's line by a few hundredths of a millimetre, against CLAUDE.md's rule that an intervention changes only what it touches. The reading is now taken nearest the middle of the cell. Two existing tests moved with it: the number of wisteria pods a cut of spurs takes (two to one), and the count of runs held in a stripped wisteria, which also counts shoots of the year that took hold from the air and now compares the framework's runs only.

**Pictures, before and after.** The vault top in January after the cut: no comb and no hips; a few side shoots that did not flower stand at varied angles, and stubs along the canes. On 5 January, before the cut: shoots at varied angles, far fewer hips than before (deadheading took most), some bowed. On the specimen frame the summer rose's side shoots fan round the canes and over the top beam where they stood as parallel rods. The hydrangea's comb on the top beam is now a fan; it has no routine, so its side shoots stand straight-ish for their three years.

**What is still wrong, or not done.**

- *A later flower opens at the end of the same shoot.* In life it is borne on a shorter shoot that breaks from a node below the spent spray. That fork is not modelled.
- *Unflowered side shoots stand all winter* at full length, thin and bare, as the RHS's wording leaves them; a gardener might shorten them too.
- *Shoots on a cane that runs downhill set out downhill* (forward along the cane) before the tropism turns them; a few start well below the level.
- *No cane is renewed.* The model makes six canes and the routine keeps six.
- *The first length of a side shoot is not tested against the timber*, because the round bar that stands in for each member could hold a shoot's foot inside the member crossing its own; the heading keeps it outward from its own support.
- *Every new number is a choice.* No branching angle, break date, divergence or shoot thickness has been measured on any plant in the library, nor a rose spray or hip weighed.

Tests: `packages/core/test/side-shoots.test.ts`.

## 12. The gardener's care for the vine and the ivy, shoots that arch over, leaves that turn to the open

Added 12 and 13 November 2026. Two more plants had been laid beside photographs. The crimson glory vine, trained, stood in January as a thicket of straight canes 0.8 m above the frame, which a gardener cuts back every December; the ivy stood shoots up off the top beam. It was the rose's comb (section 11) in two other guises. The owner's rule for all of it: the plant a client is shown is the plant as the in-house gardener keeps it (`PROJECT_CONTEXT.md` section 3.4).

**The vine's routine** (`vineRoutine` in `sim/scenarios.ts`, `MODELLED_ROUTINE` and the reference palette). 15 December each year: every side shoot, flowered or not, and every free cane is cut back to one or two buds; next year's shoot breaks from the top of the stub. 7 July and 15 August: every shoot of the year is shortened to five or six leaves. The framework is not cut. Bean, of the genus (https://www.treesandshrubsonline.org/articles/vitis/): "The young shoots are shortened back once or twice during the summer, and then cut hard back in December or January to one or two buds (later pruning causes bleeding)". The RHS plant record gives pruning group 11, "in midwinter, and in midsummer, if restricted growth is required"; the count of leaves is the RHS's for grapevines grown as rod and spur ("Shorten non-flowering side-branches to five leaves", https://www.rhs.org.uk/fruit/grapes/rod-and-spur-pruning-system). A bunch at the end of a shortened shoot is kept and carried to the cut end (`keepEndFlower`): on the plant it stands at the third to sixth node, inside what is kept, and the model can put it only at the shoot's end. The stand-in the vine's model used for the winter cut (side shoots that lived one season) is gone: an untended vine keeps its shoots.

**The ivy's routine** (`ivyRoutine`). 25 February each year from the second: a new event, `trim_to_bounds`, cuts off where it leaves the timber every free shoot of the year that holds nothing and stands more than 0.5 m out. 5 September every second year: adult shoots are cut back to within 0.5 m of their stem. Nothing is cut from March to August, the nesting season the RHS names. There is no declared envelope in a design yet, so "out of bounds" means free of the structure beyond a stated distance; that distance is a choice.

**`shorten_side_shoots`** now takes a number of nodes to keep (`keepNodes`), a distance to keep within (`withinM`), which shoots (`which`: flowered or all), whether free shoots of the year are cut with them (`freeShoots`), what is left (`remains`: a stub that bears again, or a shortened shoot) and `keepEndFlower`. The rose's form of it runs as before.

**A shoot in the air** (`sim/free-shoot.ts`). Three things were wrong after section 10. A shoot that set out exactly plumb carried no bending load and stood straight; every whip off a level member set out nearly plumb; and each new length was laid in the direction the tip had that day and never moved, which kept the foot of every shoot as straight as it set out and put all the bend at the tip: a row of rods with nodding ends.

- A shoot that would set out plumb leans a little, to a side drawn from where it stands (`mechanics.leanDeg`), and a leaf's weight acts off the stem (`mechanics.leafWeightOffsetShare`), as a moment in the rod.
- A whip leaves from the axil of its leaf at the side-shoot angles, without the old pull straight up.
- While a shoot grows, the whole of its free length is laid along the shape its rod balances in that day: the foot bends as the load on it grows. It sets when it stops growing or is cut, and does not spring back when its leaves fall. Where that shape would pass through timber or cable the shoot is taken to rest there. The render contract keeps one position for each point, so a still of an earlier day shows the part of the shoot that was there then along its final shape.
- Reach no longer stops a shoot. Past `mechanics.searcherReachM` it no longer lifts its growing end; its weight brings it over and it grows on to its planned length.

**Leaf stalks** were pointed by a fixed mix of sideways, up and along the stem. Each is now turned part of the way towards the open (away from what the stem lies on) and the light the place has (`organs.leafTurnToOpenShare`), square to the line of its rank so that ranks and pairs stay. How the blade hangs on its stalk is the viewer's (`packages/viewer/src/plant/hold.ts`).

**Flowers at the ends of side shoots** are scaled by the light the plant has, as flowers elsewhere were. Ivy flowers only on well-lit adult growth.

**An evergreen leaf at the end of its life** fell on 1 January. It now falls on a day in the window a model gives (`phenology.evergreenLeafFallDoy`), in the year after its last full season; without the window it falls as before. Ivy's is 10 May to 20 June ("The main period of litterfall occurs in late spring", the US Forest Service review); the review gives no dates and the six weeks are a choice.

**New numbers.** All optional (`GROWTH_PARAMS_OPTIONAL`); the first three have generic values in `sim/generic-shoot.ts`, used where a model gives none, with the run saying so once for the plant. None is measured.

| Parameter | Value | What it decides |
|---|---|---|
| `mechanics.leanDeg` | generic 4 degrees | How far from plumb a shoot sets out that would have set out plumb |
| `mechanics.leafWeightOffsetShare` | generic 0.5 | How far off the stem a leaf's weight acts, as a share of its length |
| `organs.leafTurnToOpenShare` | generic 0.5 | How far a leaf stalk is turned from the fixed recipe towards the open and the light |
| `pruning.winterBudsKept` | vine: 1 to 2 (Bean) | Buds left on each shoot of the year at the winter cut |
| `pruning.summerLeavesKept` | vine: 5 to 6 (RHS, of grapevines) | Leaves left on each shoot of the year at a summer cut |
| `phenology.evergreenLeafFallDoy` | ivy: day 130 to 171 | When an evergreen leaf at the end of its life falls |

The vine's own mechanics were set again with them: a shoot stays green for 120 days (it ripens from its foot from late summer), and its leaf weight is worked out for the true blade, which is far larger than the outline the engine takes for a leaf.

**Pictures, before and after** (the specimen frame, trained, six years; the ivy twelve). The vine in January: spurs along the framework, no canes standing above the frame. The vine in early July: shoots arch over the top and hang down both faces as a mass of leaf, where they stood as rods. The ivy in July: a hanging curtain of leaf, one shoot still leaning up at the top of the post. The wisteria and the rose, as controls, read as they did.

**Which runs moved.** Every run: the lean, the leaf's off-centre weight and the laying of a shoot along its balance shape act on every free shoot of every plant. Frameworks are the same; holds taken from the air, and so route shares on a few specimens, moved by a few points. Runs that plant the vine or the ivy moved further, through their routines.

**What is still wrong, or not done.**

- *The routine does not restrain the vine's spread.* Its framework is not cut, and on the reference hemisphere it held about 280 m at twelve years with and without the routine (measured after the routine alone; not measured again after the mechanics changed). Whether the gardener holds it to a lane of its own is a decision for the owner, and would need an extent declared in the planting plan.
- *An earlier day is drawn along the final shape* of a growing shoot, so a young shoot is shown leaning as it will when long.
- *No force from the timber* is worked out where a shoot rests on it, and a shoot does not lean on another shoot.
- *"Out of bounds" for the ivy* is a distance from the timber, not a declared envelope.
- *A vine's bunch* is still drawn at the end of its shoot.
- *Side shoots do not fork and old shoots do not die back* (as section 11).
- *Every new number is a choice* except the two counts taken from Bean and the RHS.

Tests: `packages/core/test/care.test.ts`, `packages/core/test/posture.test.ts`, and the changed cases in `packages/core/test/free-shoot.test.ts`.

## 13. Routines of care for six more plants, and the shared tests after the eight new taxa

Added 13 November 2026, after eight more climbers were merged, each built by its own agent against photographs. Six of them had a routine of care that the model did not act on, and without it some showed what the owner had objected to three times: rows of straight shoots above the timber and bare threads hanging in the air. The rule (`PROJECT_CONTEXT.md` section 3.4): the plant a client is shown is the plant as the in-house gardener keeps it.

**The six routines** (`sim/scenarios.ts`, each with its dates, distances and quotations in its own comment; all six in `MODELLED_ROUTINE`, dispatched through `routineEvents` in `sim/planting.ts`; the four that are in the reference palette in its trained events). No new event type.

| Plant | Routine | What it rests on |
|---|---|---|
| *Clematis armandii* | 20 May from the second year: free shoots beyond 0.6 m cut off (`trim_to_bounds`) | RHS: pruning limited to "restricting them to the space available"; group 1, after flowering |
| *C. cirrhosa* 'Freckles' | Planting day: all stems to 0.3 m (`hard_prune`). 25 March from the second year: free shoots beyond 0.3 m cut off | RHS group 1: "pruned back hard the first spring after planting", to "a strong pair of leaf buds about 30cm (12in) above soil level"; prune "immediately after flowering" |
| *Lonicera periclymenum* 'Graham Thomas' | Planting day: the nursery stem cut by two thirds. 1 March from the first year after planting: free shoots beyond 0.5 m cut off. 5 September: flowered side shoots keep 60 to 70% (`shorten_side_shoots`, `remains: 'shoot'`) | RHS honeysuckle guide: "wayward long shoots"; "Cut back flowered shoots by one-third in late summer"; at planting, cut by two thirds "to encourage strong new shoots from the base" |
| Star jasmine | 15 April from the second year: free shoots beyond 0.3 m cut off | RHS: "Maintenance pruning, if required, should be done in spring" |
| *Akebia quinata* | From the third year (its first flowering): 5 June beyond 0.3 m, 1 September beyond 0.5 m, cut off | RHS group 11: "Those that flower on the previous year's growth should be pruned after flowering"; the distances are the species agent's choice |
| Trumpet vine | 25 February from the third year: every side shoot and free shoot of the year to one or two nodes, as stubs (`shorten_side_shoots`, `keepNodes` [1, 2]) | RHS: spur-prune "in late winter", "to within two or three buds of the main stems" |

Two departures from the routines as handed over, both because the engine regrows a cut stem only at the start of a season (`startSeason`): the winter clematis's first cut is on planting day, not 20 March (its buds break on 16 March; cut on the 20th, the cane's stub stood bare all summer and the young stems, shorter than the cut, shot again from their tips the next spring), and so is the honeysuckle's planting cut (its season has begun by planting day). The trumpet vine's `sideShoots.lifespanYears` goes from 1 to 30, so that the cut and not the growth model sheds its shoots, as was done for the vine in section 12; an untended trumpet vine now keeps them.

**Two faults the tests found in the engine, and mended.**

- *A side shoot already no longer than the buds a winter cut keeps* (`keepNodes`) was left a shoot: neither cut nor a stub, it bore no new shoot from its node and flowered again at its old end. A trumpet vine, which flowers only "at the end of the current season's growth" (Bean), showed trusses on two-year-old ends. Such a shoot is now left as the stub the cut would leave.
- *A stub came into leaf at its own nodes every spring*, on the first day of the leaf flush, ahead of the shoots it bears; the trumpet vine was then no longer late into leaf. A stub's leaves are now those of the season before the cut; the buds at its nodes break as next season's shoot, which carries the leaves. Both mends touch only the winter stub cut, so the vine's runs moved with the trumpet vine's.

**A fault in the design report, mended.** Flowers sorted by height counted a flower in the year its flowering season began, the plants' yearly counts in the year it opened. For a display that runs through the new year (the winter clematis now opens from late October to mid February) the two disagreed by a third, and the January flowers were in no year's height sort. Both now count by the day a flower opened.

**What the stills show** (the specimen frame, six years, trained; before stills from each species agent's folder, after stills in the integrator's scratch folder, `central/routines/<id>/`):

- *Trumpet vine.* 24 February: straight shoots standing over the frame. 15 March: spurs along the framework, nothing standing. 23 August: the frame clothed and in flower, fuller than before (40 trusses open against 31).
- *Akebia.* January and April: the bare threads hanging off the post, the arm and the frame are gone (79 free shoots beyond 0.3 m to none); flowering the same within 2%.
- *Clematis armandii.* January: the bare dark strings among the hanging curtains mostly gone (221 free shoots to 129, those left being the summer's shoots that flower next spring); end of March: the flowering exactly as before, flower for flower.
- *Freckles.* Tidier and thinner: in July 9,450 leaves where there were 13,450; flowering 8% less, since the March cut takes old shoots that would have carried side shoots.
- *'Graham Thomas'.* **Does not do what it is for in winter.** The fringe of thin twigs above the top arm in January is still there. The fringe is side shoots, which `trim_to_bounds` (free shoots only) does not touch, and the September cut takes a third of the flowered ones and leaves the rest (269 unflowered of 799 in 2032). In early September the cut takes most of the fringe (15 shoots standing well above the top to 3). An existing event could say more (`shorten_side_shoots` with `withinM`, `which: 'all'` in March, as ivy's adult growth); that would be a different routine from the one handed over, and is not made.
- *Star jasmine.* Little to see: four wayward shoots a year cut; leaves and flowers within 5%.

**The shared tests.** Seventeen failed with the eight plants merged, and the routines broke three viewer tests of their own plants. Each was read for what it holds. One found the report fault above and passes untouched since; the others were changed to hold their intent for the plants as they now are, each with a comment saying what moved and why. **Design readings that changed their answer:**

- *November is no longer flowerless.* 'Freckles' opens from 25 October (a nursery's "November to February", first flowers in late October some years), and on 15 November it is the one plant in flower; ivy is no longer needed to fill the gap.
- *Winter evergreen cover, mixed vault.* From the lawn, the honeysuckle and the winter clematis together are 31.2% of the view in January: within the 25 to 40% target, where the vault was short of it from everywhere. From the approach and from inside it is still short (11.9%).
- *Winter evergreen cover, reference palette.* Still short from every viewpoint, but from the approach no longer far short: 19.6% (it was under 12.5%). With four times the leaf and three times the shoots, the approach reads 50.2%, past the top of the target; that miss rests on the unmeasured densities. From inside and from the rim it is missed either way.
- *Timber in high summer.* From the approach 68.6% of the glulam is seen on 15 July (more than 70% before; 57.9% without the four routines). Still most of it.
- *Sensitivity.* Larger leaves now move the frameworks, through light: up to 6% for most plants and 22% for the winter clematis at four times the leaf, and its flowers by a third. With light left out nothing moves.

**Which runs moved.** Every run that plants one of the six trained (the specimen frame, the reference palette, a planting plan); the trumpet vine untended (its shoots kept); the crimson glory vine trained (the two stub mends); the report's flowers by height wherever a display crosses the new year. A plant with no routine, alone, grows as before; in the palette its neighbours' care moves its light.

**What is still wrong, or not done.**

- *A side shoot that lives more than a season flowers again at its old end every year*, whether or not it grew, for every taxon with side shoots. Untended, the trumpet vine opens 353 of its 681 trusses on ends made in an earlier year; ivy, *Lonicera henryi*, the star jasmine and the untended crimson glory vine have the same rule. The gardened trumpet vine has none since the mend above. Mending it for plants that flower on the year's growth moves many runs and is left for its own step.
- *A cut after bud burst waits a year to regrow* (`startSeason`), and `hard_prune` with all stems marks stems shorter than the cut as stubs to shoot again from their tips.
- *The mixed vault plants 'Freckles' without its routine*, because its tests cut it by hand. Its winter reading would move with it (27.6% from the lawn).
- *'Graham Thomas's winter fringe* (above).
- *Every distance in a `trim_to_bounds` is a choice*; no design declares an envelope yet.
- The species profiles still say these routines are not modelled.

Tests: `packages/core/test/care.test.ts` (the six routines), and the changed cases in `annual`, `light`, `mixed`, `palette`, `report` and `sensitivity` tests and in the viewer tests of the trumpet vine and *Clematis armandii*.
