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
| Visible steel is measured (`materialSummary`) | Minimising it is a stated design goal, so it has to be a number: 46 m of cable on the vault segment, 33% of plant route | — |
| Timber is treated as rough enough for aerial roots to cling to | Ivy and climbing hydrangea cling to timber in gardens; the verdict records that this rests on an assumption about the finish | Measure on the actual glulam finish |
| Folder ids from the working labels | Least surprise: the folder matches the name in the documents | Ids from the accepted names |
| Evidence status on every value, enforced | The specification's central rule, otherwise unenforceable | Convention only |

## 6. First readings from the new core, and how far to trust them

These come from `npm run simulate -- palette trained 12`: the `KEY.md` reference palette, one plant at the foot of each of the twelve ribs of the 15 m hemisphere, twelve years on. Every growth model behind them is a running model with placeholder numbers, so they are comparisons and prompts, not predictions.

| Question | Reading | What it rests on |
|---|---|---|
| Does the yearly spectacle in `KEY.md` section 6 hold together? | Yes, in order: winter clematis December to February, *C. armandi* March and April, wisteria in May (the peak of the year by a wide margin), hydrangea, honeysuckles, summer clematis, star jasmine and rose from June to August, the rose into October. Nothing is in flower in mid November unless ivy is planted | Fixed provisional flowering dates placed inside each taxon's RHS envelope. Five of these taxa show no flowers until their flowering wood is entered (4.3) |
| Is the 25–40% winter evergreen target met? | No: about 2% of the structure's extent seen from the approach in mid January, less from inside. Ivy in place of the second evergreen honeysuckle does not change that | Leaf counts and sizes that are placeholders. The model puts leaves only at the nodes of stems it grows, and a real evergreen climber of this age is much denser than that. Leaf area per metre of stem, measured on real plants, is the first number to collect (`DEVELOPMENT_GUIDE.md` stage 7) |
| Does the timber stay legible? | Yes: 85% or more of the timber seen on the bare structure is still seen in July from every viewpoint | The same leaf densities; and three wisterias, not a full canopy |
| Which plants hold the glulam unaided? | Wisteria, climbing hydrangea, ivy and campsis. Every other climber has to be tied to timber and holds only the cables by itself | Grasp limits that are placeholders: 200 mm for wisteria, 60 mm or less for the rest. None has been measured |
| Which joints will clinging plants get into? | The report lists them: eight for the hydrangea, to 7.2 m | The assumption that aerial roots cling to this timber finish |

**A correction to the measuring instrument.** The coverage figures come from a small renderer at 240 by 180 pixels. Until this date it drew anything narrower than a pixel a full pixel wide, so thin stems and small leaves seen from a distance counted for several times their real area: mid-January timber visibility from the approach to the hemisphere read 70% where the corrected figure is 92%. A thing narrower than a pixel now takes a pixel with a chance equal to the share of the pixel it covers, and a test compares the result with a render at four times the resolution. Coverage figures quoted from earlier runs overstated how much the plants hide.

**Height.** A plant's reported height is now that of its permanent stems. Shoots of the year stand above them (the vine's canes by two metres), and counting them had the vine at 9.7 m on a structure that ends at 7.5 m.

**Flowers.** Until this date a plant that flowers along its shoots had its buds decided on a single day, from the growth present on that day, so anything grown later in the summer never flowered: the rose had six flowers open in mid August of its twelfth year. Growth made after the first buds form now goes on forming them. Flower counts for the rose, the honeysuckles, the clematis and the annual from earlier runs were too low. Separately, a flower whose stem was cut while it was open stayed in the render data for good; it now ends on the day of the cut.
