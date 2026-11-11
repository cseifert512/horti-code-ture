# CONSTRAINTS_AND_PHENOLOGY — biological and mechanical gatekeepers

## 1. Why this is a separate specification

A visually convincing vine simulation can be biologically wrong if every shoot attaches to every surface, flowers after its buds have been pruned away, or remains evergreen after cold-season leaf loss. These constraints should remain independent of the rendering method and be evaluated for each plant, support contact, organ and gardener action.

**Three categories:**
- **Hard constraints:** engineered no-attachment zones; a rose cannot self-twine; a non-climber cannot ascend; a pruned-off bud cannot bloom later.
- **Probabilistic biological constraints:** contact success, tip exploration, flower induction, dormancy/forcing, frost damage, leaf persistence.
- **Design/maintenance constraints:** access, allowable canopy occupation, species mixture, pruning and human training.

Do not use published RHS mature height, hardiness ratings or flower seasons as mechanical constants.

## 2. Mechanical attachment classes

| Class | Representative taxa | Required local conditions | Failure/management mode |
|---|---|---|---|
| `stem_twining` | *Wisteria*, *Lonicera*, *Trachelospermum*, *Akebia*, *Thunbergia* | Support contact, suitable cross-section/geometry, growing shoot flexibility and free winding path | Excessively large/smooth/inaccessible support, wind displacement, loss of contact; trained/tied leader can compensate |
| `petiole_twining` | *Clematis* spp./cultivars | **Fine** reachable rods/wires for leaf stalks to grasp while growing | Coarse member too large for petiole clasp; untrained shoots hang or scramble |
| `tendril` | *Vitis coignetiae* | Graspable local support within reach of developing tendrils | Failure to encounter/encircle a support; unsupported laterals |
| `aerial_root` | *Hedera helix*, *Hydrangea anomala* subsp. *petiolaris*, *Campsis* | Compatible, often textured contact substrate; humidity/development and contact matter | Unsupported open smooth rods and forbidden timber surfaces; ties may be required during establishment |
| `scramble_and_tie` | *Rosa* 'The Generous Gardener' | Gardener-created attachments and open room for canes | No independent climb without human attachment |
| `none` | *Sarcococca confusa* | Soil/bed only | Must not be routed into the climbing graph |

**Twining orientation matters.** RHS describes *W. sinensis* as anticlockwise and *W. floribunda* as clockwise, but a program must define an unambiguous direction convention **viewed from the plant base toward the tip** (or vice versa) before implementing a handedness sign. Verify against the existing *W. sinensis* model and observed specimens.

**Convention adopted (11 November 2026).** The RHS states no viewpoint, and other writers describing the same plant use opposite words depending on where they stand (Darwin's "with the sun", the plant's-eye view, and older against newer usage of *dextrorse* and *sinistrorse* all flip). The project therefore records handedness as the **chirality of the helix**, which no viewpoint can change:

- `right_handed` — like an ordinary screw thread. Climbing a vertical support, the stem turns **anticlockwise seen from above**, looking down on the tip.
- `left_handed` — the mirror image: **clockwise seen from above**.

Do not use *dextrorse* or *sinistrorse* in data or code.

| Taxon | Helix | Seen from above | Confidence and basis |
|---|---|---|---|
| *Wisteria sinensis* | right-handed | anticlockwise | High: RHS, Valder 1995, Darwin, Flora of China. The prototype twines this way on every run. |
| *Wisteria floribunda* | left-handed | clockwise | High: RHS, Valder 1995, Japanese tree guides. |
| *Lonicera periclymenum* | left-handed | clockwise | High for the geometry; no peer-reviewed species-level source retrieved. |
| *Lonicera henryi* | left-handed (inferred) | clockwise (inferred) | Low to medium: from congeners only. Check a specimen. |
| *Akebia quinata* | right-handed | anticlockwise | High: Darwin, University of Michigan CLIMBERS. |
| *Thunbergia alata* | right-handed | anticlockwise | Medium to high: Darwin. |
| *Trachelospermum jasminoides* | unknown | unknown | No source found. Must be observed. |

Two published accounts were found to contradict the table for the wisterias (one swaps the species; one contradicts itself between sections), which is why field verification stays on the validation list in section 8.

### Local-support variables to track

- 3-D support curve; local tangent and gravity vector; orientation/slope; curvature and twisting of the route.
- Cross-section, diameter or effective gripping radius; surface roughness/texture; wet/dry condition; edge geometry.
- Distance from growing tip to support; probability of a physical encounter; exposure/wind; tip age and flexibility.
- Attachment status: `searching`, `contacted`, `grasped`, `trained_by_human`, `stable`, `detached`, `failed`, `prohibited`.
- Contact location; attached stem length; winding turns/handedness if twining; stem thickening clearance; contact age and strength class.
- Primary timber contact prohibition flag, tie-permitted flag, inspection/maintenance zone, support-removal policy.

### Mechanical hypotheses, not fabricated thresholds

Physical models of twining predict a **maximum support radius** for some configurations and contact-related pressures/tension (Goriely & Neukirch, 2006). Tendril research demonstrates contact-triggered coiling and support size dependence. **Neither yields a universal safe wire thickness or support radius for all species and cultivars.** All numerical values must come from measured garden/prototype observations, directly relevant literature, or uncertainty sweeps.

### Ageing/thickening risk

Plant stems grow in diameter, while manufactured timber geometry changes only by engineering deformation or weathering. A formerly safe loop around a timber beam or cable can develop constriction, bark damage, high contact forces, or become impossible to remove. Track clearance and permit **gardener redirection/removal** before a critical tolerance is exceeded. Never silently treat botanical self-twining as a certified structural connection.

## 3. Why age of wood matters — precise interpretation

Here **“wood” means lignified or maturing tissue belonging to the plant**: e.g., a wisteria's woody stem, a cane, a lateral shoot or a short spur. It **does not mean Bower's manufactured wooden members**.

The relevant time concepts are not interchangeable:

1. **Chronological axis age:** number of days/years since the living stem was formed.
2. **Growth cohort:** the year/season in which an individual shoot was produced.
3. **Developmental state:** vegetative versus mature/reproductive, herbaceous versus woody.
4. **Bud history:** when a bud was initiated, whether floral fate was induced, whether it survived winter, and whether pruning removed it.
5. **Framework age:** old perennial main arms/trunks versus short laterals/spurs attached to them.

**Wisteria:** flower buds begin to develop in late summer **of the preceding year**. The flowering display is influenced by retained short spurs/wood maturation, adequate light/water during induction, winter survival and spring conditions. A gardener can remove the very bud-bearing positions that would have flowered. Modelling only current branch length would miss this causal chain.

**Clematis contrast:** *C. cirrhosa* (Group 1) flowers predominantly on the previous year's growth; *C. viticella* 'Étoile Violette' and *Clematis* 'Princess Diana' (Group 3) flower on **current-season** shoots, so winter pruning can be much more aggressive without the same consequences for next summer's flowers.

**Climbing hydrangea:** flowering occurs on shoots formed the previous year, so cutting all side growth after winter changes the subsequent flower display. **Roses and Campsis** require their own seasonal lateral-growth and repeat-flowering mechanisms, not wisteria's exact rule.

### Minimum bud states

`undifferentiated` → `vegetative` or `floral_induction` → `floral_bud` → `dormant/overwintering` → `developing` → `open` → `senescent`, with `aborted` or `removed_by_pruning` exits possible at any appropriate stage. Preserve organ-host linkage.

**In data** this life cycle is carried by three fields, not one state word, because a dormant bud must still know whether it is floral: **fate** (`undetermined`, `vegetative`, `floral`), **stage** (`initiated`, `dormant`, `developing`, `open`, `spent`) and **end** (`aborted`, `removed_by_pruning`). So `floral_bud` is fate `floral` at stage `initiated`; `dormant/overwintering` is stage `dormant` with the fate unchanged; `senescent` is stage `spent`. The full mapping, including the differently worded list in `SIMULATION_KEY.md`, is in `packages/core/src/vocab.ts`.

### Hard pruning test

If a gardener removes an older *C. cirrhosa* shoot with overwintering flower buds, those buds cannot flower. If a gardener cuts back a Group 3 clematis late winter, new stems can subsequently produce flowers in the same season. For wisteria, heavy removal of established spur-bearing wood can depress or delay future bloom even if the plant regrows vigorously.

## 4. Flower-bud induction, chilling and forcing

Separate the life cycle into **initiation/induction**, **dormancy acquisition**, **dormancy release** and **flower development/opening**:

| Stage | Key inputs to consider | Simulation rule status |
|---|---|---|
| Floral competence | Plant age, axis age, growth history, cultivar, resources | Species-specific; mostly uncalibrated |
| Flower-bud induction | Photoperiod, past summer temperature, light, water stress, nutrition, species/cultivar | Known broadly for wisteria as previous late-summer bud formation; numerical threshold unknown |
| Dormancy | Winter temperature and duration, photoperiod, internal state | Do not assume every plant needs the same chilling-hours threshold |
| Chilling fulfillment | Winter cold exposure, genotype, cultivar | Use if supported by evidence; unmeasured for this scaffold |
| Forcing / thermal accumulation | Spring/seasonal warmth after dormancy, water, organ health | Proposed species-specific temperature response with undefined thermal requirement |
| Visible bloom | Surviving bud count, plant age, light, pruning history, frost events | Phenology + organ state, not an unconditional month switch |
| Fruit development | Pollination, cultivar compatibility, weather, pruning | Later-stage optional module |

**Caution:** generalized temperature-sum models are useful heuristics, but do not assign invented cultivar-specific chilling thresholds. A winter-flowering clematis has different phenology from a spring-flowering wisteria; evergreen winter foliage is another separate physiological process.

## 5. Leaf state and evergreen realism

Represent leaf flush, expansion, senescence and abscission on organ/branch cohorts. An evergreen species still sheds old leaves and may suffer cold-wind desiccation, leaf scorch or site-specific dieback. An RHS H4/H5/H6 hardiness rating is an **approximate survival range** under UK conditions, not a guaranteed leaf-retention or winter-flowering score.

- Deciduous: *Wisteria*, *Vitis*, *Lonicera periclymenum*, Group 3 *Clematis*, *Hydrangea*, *Campsis*, climbing rose (often largely deciduous in the UK).
- Evergreen: *Lonicera henryi*, *Trachelospermum*, *Clematis cirrhosa*, *Clematis armandi*, *Hedera helix*, *Sarcococca*. (*L. henryi* is evergreen per the RHS but "winter-green or semi-deciduous" in British field accounts and semi-evergreen in Flora of China: do not count on full winter cover from it in exposed sectors.)
- Semi-evergreen: *Akebia quinata* — leaf retention is climate-dependent.
- *Thunbergia alata* is botanically perennial in warm conditions but treated as a **tender annual outdoors in the UK**.

## 6. Other biological and physical constraints

1. **Light:** sunlight is directional; foliage shades lower plants and suppresses flowering even when stems remain vigorous.
2. **Water and root space:** shared root zones can create a strong asymmetry; shallow small beds may not sustain vigorous full-size upper climbers. Soil volume/site measurements required.
3. **Microclimate:** exposed high canopy versus sheltered lower side are not equivalent, even within one Bower.
4. **Spatial clearance:** racemes, rose thorns, falling flowers/fruits, pedestrian headroom, lighting, maintenance pathways and future timber inspection.
5. **Species competition:** fast species can occupy cable pathways and shade slow species. Start with geometry/occlusion, not unsupported allelopathy assumptions.
6. **Wind and structural loads:** plant-surface area changes over seasons, can trap water and change drag. Treat as an engineering interface, never an unvalidated allowable force.
7. **Access:** any plant must have a feasible intervention envelope; inaccessible wisteria pruning is not an acceptable invisible assumption.
8. **Site ecology:** check regionally invasive taxa, species impact on habitat, public access and biosecurity; a British palette cannot automatically be exported worldwide.
9. **Rooted versus unrooted:** climbing attachment does not supply soil nutrients/water; plants still require viable roots, except unusual taxa not included here.
10. **Time:** individual perennials persist over decades unless removed; the annual replacement module only resets annuals.

## 7. Initial engineering policy

- **Primary structure is not a climbing substrate by default.** Surfaces have a contact permission state.
- **Every active support is inspectable/replaceable where reasonable.** If it cannot be accessed, that section of plant routing needs explicit review.
- A successful attachment simulation means a plausible botanical contact, **not structural safety**.
- Load/contact magnitudes remain unknown until measurement and structural-engineer review.

## 8. Validation priorities

First compare observed vs simulated: (1) twining direction and tip exploration; (2) grasping fine versus coarse test supports; (3) buds and subsequent flowers before/after pruning; (4) winter foliage in exposed versus sheltered areas; (5) gardener time and physical reach. Record measurements by species/cultivar, age, light, support geometry and site.

**Sources:** RHS wisteria growing/pruning/FAQ; RHS clematis Group 1/Group 3 profiles; RHS climbing hydrangea guide; Goriely & Neukirch 2006; *Journal of Experimental Botany* 2022 tendril biomechanics; RHS ivy-on-buildings guidance. Full URLs in `SOURCES_AND_ASSUMPTIONS.md`.
