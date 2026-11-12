# SIMULATION_KEY — scientific model specification

## 1. Primary objective

Extend an existing generative *Wisteria sinensis* model into a **multi-taxon, gardener-managed, structure-aware functional–structural plant model (FSPM)**. The near-term purpose is to simulate **credible spatial growth, attachment, visual seasonal change, and maintenance** across a Bower. Precise ecology, carbon balance, long-term load prediction and species-specific flowering physiology are **later research tracks**, not barriers to a first usable model.

A 2026 synthesis of FSPMs organizes the problem around **plant function, geometry, topology and environment**. Keep the model modular enough that approximate functions can be replaced by calibrated ones without changing the underlying plant-support graph.

## 2. Represent two graphs, not one

**Graph A — manufactured architecture and local supports**

- `GlobalBower`: whole-shell geometry, structural members, load zones, any declared exclusion surfaces and maintenance access.
- `StructuralMember`: member ID, 3-D curve/solid, material, diameter/profile, orientation, curvature, junctions, inspection needs and attachments permitted.
- `LocalSupport`: the steel and fixings of the sub-lattice — slender cables and tie points (the timber part of the sub-lattice is `StructuralMember`s of a lighter tier); each has geometry, cross-section, roughness, strength specification, attachment permissions, failure/maintenance state and relationship to the main structure.
- `RootStation`: geolocation/position, available soil volume, moisture, pH, microclimate, irrigation, crowding and access.

**Graph B — each living individual**

- `TaxonProfile` (stable): accepted botanical name + cultivar, climbing mechanism, evergreen status, flowering-wood class, horticultural envelope, trait provenance and unknown parameters.
- `PlantIndividual`: unique ID, root station, provenance, age since propagation/planting, health, resource state and gardener ownership/management regime.
- `Axis / Stem / Internode`: plant-parent relationship, botanical age and cohort, 3-D geometry, diameter, fresh/woody state, mechanical orientation, growth potential, dominant/subordinate status and live/dead flag.
- `Bud`: location, creation time, **fate** (`undetermined`, `vegetative`, `floral`), **stage** (`initiated`, `dormant`, `developing`, `open`, `spent`) and, where it stopped early, **end** (`aborted`, `removed_by_pruning`); overwintering history, host stem identity, source/uncertainty. Fate and stage are separate because a dormant bud must still know whether it is floral. Floral *competence* belongs to the bearing axis and plant (age, maturity), not to the bud. This vocabulary is canonical; `packages/core/src/vocab.ts` maps the older single-word state lists on to it.
- `Leaf / Flower / Fruit cohort`: organ type, birth date, area/mass/colour, developmental stage and senescence time.
- `SupportContact`: living node/segment ID, contact position and date, manufactured support ID, mechanism, attachment success, strain clearance, tie type and detach time.

**Graph C — environment and human operations (links both graphs)**

- `SiteWeather`: daily/hourly temperature, incident PAR, day length, rain, humidity/VPD, wind, extreme frost, site-specific microclimates.
- `SoilState`: moisture/water potential, rooting volume, fertility, drainage, competition and irrigation history.
- `GardenerEvent`: date, author, action, targets, geometry before/after, affected buds, physical safety status, plant response and cost/time.
- `Observation`: real field data with timestamp, measurement method, units, plant/support ID, confidence and photos/geometry references.

**Suggested hierarchy:** site → Bower → support network and root stations → plant individual → axes → growth units/internodes → leaves/buds/flowers; contacts cross-link plant and manufactured support elements. OpenAlea's Multiscale Tree Graph is a relevant reference, not a mandated dependency.

## 3. Unit and provenance discipline

- Position/length in **metres**, diameter in **millimetres**, area in **m²**, biomass/load in **kg / N**, temperatures in **°C** and dates in ISO format.
- Keep light units explicit: PAR photon flux often **μmol photons m⁻² s⁻¹**; daily light integral **mol photons m⁻² day⁻¹**.
- Classify every number as `measured`, `published_plant_profile`, `peer_reviewed`, `calibrated`, `provisional_design_assumption`, or `unknown`. Two further labels cover values that are choices and not facts about plants: `design_target` (a Bower design intention) and `site_dependent` (decided per site). These eight are the canonical evidence statuses (`packages/core/src/vocab.ts`); the shorter lists in `README.md` and `SOURCES_AND_ASSUMPTIONS.md` map on to them. Enforced rules: an `unknown` carries no value; evidence names its source; an assumption or target states its basis.
- A flowering calendar or RHS height band is an **observational envelope**, not a calibrated growth coefficient.
- Record source URL/DOI, taxon, cultivar, life stage, climate, method, study date, applicability and uncertainty distribution.
- Unknown species parameters should stay **unfilled** rather than adopting universal constants without explanation.

## 4. Coupled processes and proposed equations

### 4.1 Potential stem extension — first-pass empirical form

\[
\Delta L_{i,t} = G^{\ast}_{i,t}\, f_T(T_t)\, f_{PAR}(PAR_{i,t})\, f_W(\Psi_{soil,t})\, f_R(R_{plant,t})\, f_M(M_{i,t})
\]

`i` is a shoot and `t` a time step; `G*` is **species/age/axis-specific potential extension**; each modifier lies in a justified bounded range. The final factor `f_M` represents **management outcomes**, not an unexplained biological constant. This is a provisional process *shape*, **not a validated universal equation**; stress interactions need not be multiplicative. A later carbon-allocation model can supersede it.

### 4.2 Temperature-driven development — illustrative, not species-calibrated

\[
GDD(t) = \sum_{\tau=1}^{t} \max(0,T_{mean,\tau}-T_{base})
\]

A growing-degree-day formulation can approximate some developmental events; `T_base` and thermal requirements are **unknown for each cultivar until sourced or measured**. It does not replace chilling, photoperiod, water-stress or dormancy models.

### 4.3 Attachment probability and route eligibility

\[
P(attach) = f_{mechanism}(d_{support},\kappa,\alpha,roughness,contact,ontogeny,training,wind)
\]

Evaluate each tip/contact against the local support and its mechanism (stem twining, petiole twining, tendril, aerial root, scrambling/tie, none). Enforce any **declared exclusion surfaces**, attachment duration, unsupported span, ageing/thickening and gardener-supplied tie events. A failed encounter cannot magically produce a stable climbing connection.

#### Unsupported shoots (note of 12 November 2026)

This section asks for the "unsupported span" to be enforced and says no more about a shoot that is on no support. Until this date the engine grew such a shoot as the prototype drew its whips: along its heading, with a little random wander and a droop that depended only on how much of its planned length it had made. Its thickness, its leaves and what stood in front of it changed nothing, and a wisteria shoot 4 mm thick stood 2 m into the air. The owner asked for that to be put right ("the plant growth is bounded by physics... gravity and sun are still very much factors"), and it is replaced by the rules below, for every taxon, because the first priority of `PROJECT_CONTEXT.md` section 0 is mechanical plausibility. The mechanics and what they leave out are set out at the head of `packages/core/src/sim/free-shoot.ts`; the numbers and their sources are in `sim/generic-shoot.ts`; what was found is in `docs/ASSUMPTIONS_AUDIT.md` section 10. Tests: `packages/core/test/free-shoot.test.ts`.

**(a) A shoot in the air is a rod under its own weight.** It is fixed where it leaves its support or its parent stem and carries its own weight and that of its leaves, flowers and fruit. With ψ the angle of the stem from plumb (0 up, π down) at distance s from the base, κ* the curvature its own growth gave it, M the bending moment and W(s) the weight of everything beyond s:

\[
\frac{d\psi}{ds} = \kappa^{*}(s) + \frac{M(s)}{E(s)\,I(s)}, \qquad \frac{dM}{ds} = -W(s)\,\sin\psi, \qquad \psi(0)=\psi_{base},\; M(L)=0, \qquad I = \tfrac{\pi}{4} r^{4}
\]

This is the elastica of a heavy rod, with its large rotations kept. E rises from the taxon's green-shoot modulus to its set-wood modulus over the days its model gives; r is the radius the run stores for the stem. A level rod sags at its tip by wL³/6EI while that is small, and an upright one stands only up to Greenhill's height, 1.986 (EI/w)^(1/3): both are tested. Nothing is a drawn curve.

**(b) As grown.** The render contract stores one fixed position for each point of a stem. So each new length is laid in the direction the rod's tip has on the day it is laid, and what is already laid keeps the shape it had when its wood set: it is not bent further as the shoot beyond it grows heavier. The line drawn keeps more of an arch near the base than a wholly elastic rod of the final length would.

**(c) Finite reach.** While a shoot holds its tip at or above the level it is `self_supporting` and steers. When its weight has turned its tip below the level although its growth points it above, it is `pendulous`: it stops steering and grows on as it hangs, to its planned length, and once it hangs within a few degrees of straight down it is `plumb`. A shoot that still holds itself up when the straight line from its base to its tip reaches `mechanics.searcherReachM` grows no further: that parameter is what has been measured of how far searcher shoots hold themselves out.

**(d) Not below the ground.** A shoot that comes down to the ground stops there. Nothing is laid below z = 0.

**(e) Not through the timber.** A length of stem is not laid into a member or cable. A shoot that holds itself up turns aside along what it meets, or away from it; one that hangs comes to rest on it. Every member and cable is taken as round for this, with the radius of the bar of the same perimeter.

**(f) Taking hold again.** A searching shoot (any shoot in the air but a flowering side shoot) whose tip comes within `attachment.graspReachM` of a stretch of route that its way of holding on can grasp by itself (`attachment.ts`), and that is not already carrying all the stems it can, takes hold there and grows on as supported growth. The hold is `contacted` on the day it is made and `grasped` once a coil's length of stem lies along the support. A support that was already within reach where the shoot set out does not count: this is how a climber crosses a gap, not how a bud at a node chooses a member, which is the framework's decision. A shoot in the air is never tied in. **Its holds do not use up the framework's room**: leaders and laterals count leaders and laterals when they choose a member, so that what a shoot of the year does never reroutes the framework; where framework comes to a member such shoots have filled, the last of them gives up its place. A hold that a cut leaves with less than a coil of stem on the support is lost with the cut.

**(g) Light.** While it holds itself up, the growing end turns towards a direction between plumb and the light, by `tropism.turnPerM` radians for each metre grown. Which way the light is, is asked of the scenario (`Scenario.lightFrom`), then of the light model (the sky as seen from the nearest place it reads light at, behind the timber, what the site declares and last season's leaf of other plants), and failing both is taken as the open sky of the site: straight up for the share of light that comes from the whole sky, and from the sun's side for the rest.

**(h) Numbers.** Eleven parameters, all optional in a growth model (`mechanics.*`, `tropism.*`, `attachment.graspReachM`). A shoot has to be bounded whether or not the plant has been measured, so where a model gives none the engine uses one generic value for any woody climber (`sim/generic-shoot.ts`), each labelled a provisional assumption with its basis and source, and the run says once for each plant which of them it was drawn with (`generic_shoot` in the decisions and the report's alerts). None of the eleven has been measured on any plant in the library.

Not changed by this note: a spur is still the short drawn curve the prototype gave it; a leader or lateral that finds no way on at a node still stops there and does not set out into the air; wind, rain and snow are not loads.

### 4.4 Bud history / flowering for old-wood species

\[
B_{open,t} \approx B_{initiated,t-1}\, S_{winter}\, S_{retained\ by\ pruning}\, F_{development}(T,light,water)
\]

The plant's **own** previous-season buds and subtending shoots are relevant. This expression is conceptual: coefficients require calibration and not all taxa use previous-year growth. For Group 3 clematis, flower buds/flowers principally develop on **current-season** stems. Wisteria flowering depends on late-previous-summer bud initiation, spurs and seasonal pruning; *Clematis cirrhosa* generally flowers on previous-year growth.

### 4.5 Preliminary vegetation-load screening (NOT structural design)

\[
M_{vegetation}=M_{woody}+M_{leaves}+M_{flowers/fruits}+M_{retained\ water}
\]

\[
F_{wind}\approx \tfrac12\rho_{air}C_DA_{projected}v^2
\]

These are **bookkeeping and sensitivity equations**, not evidence of actual loads or allowable limits. Species architecture, porosity, leaf season, rain/snow, branch dynamics and load transfer to supports require engineering research and validation. Never use this model for member sizing or public safety certification.

## 5. Minimum per-species parameter dictionary

| Parameter group | Candidate fields | Initial state |
|---|---|---|
| Identity | accepted name, cultivar, synonyms, native status, invasive-region warnings | Source per taxon |
| Horticulture | RHS mature-height class, hardiness, evergreen/deciduous, exposure, soil, light | Published range / qualitative |
| Morphology | organ lengths, diameters, branch-angle distributions, internode distribution, bud placement, leaf area, floral raceme/flower architecture | Mostly **unknown** |
| Growth | shoot-extension response, branching frequency, wood thickening, root growth, leaf production, physiological age | **Unknown/calibrate** |
| Climbing | attachment type, handedness where established, maximum graspable support cross-section, contact sensitivity, slip/detach response | Mechanism known; numeric tolerance unknown |
| Phenology | bud initiation window, dormancy/chill response, thermal forcing, flowering-wood class, leaf emergence/senescence, fruit | Qualitative first; calibrate |
| Resource | light interception, PAR response, water response, rooting volume, competition | Site-adjusted hypotheses |
| Management | trainable axes, pruning month/target, allowable tie systems, regrowth after cut, annual replacement flag | Curated rules |
| Output | projected leaf cover, flowers visible, stem mass proxy, management hours, plant vitality | Derived after simulation |

## 6. Recommended temporal and spatial fidelity

**Start with daily biological time steps**, annual multi-year runs and monthly visual output. Do not begin with a minute-by-minute photosynthesis or CFD model. Spatially, preserve individual axes/internodes and their 3-D contact with the timber and its sub-lattice; use aggregated foliage/flower cohorts until measurements justify explicit every-leaf geometry.

Three distinct passes:

1. **Architecture pass:** grow/branch/train the plant through an eligible support graph.
2. **Seasonal pass:** emit/senesce leaves and flowers based on species life history, previous-year buds and weather.
3. **Management pass:** apply interventions to the living graph and re-evaluate occupation and attachment, with no yearly reset of the perennial plant.

## 7. Interactions among different plants

- Start with **shared light occlusion**, **root-area/moisture overlap**, **competition for physical routes**, and **gardener operations**.
- Model shading by observed/transmissivity-informed foliage cover and position, rather than guessing species aggressiveness coefficients.
- Represent root competition at an aggregate root-station level initially; do not claim calibrated belowground physiology.
- Restrict cross-species twining entanglement and support occupation unless an explicit maintenance policy allows it.
- Preserve distinct taxon/cultivar state; never transfer wisteria-specific spurs, twining handedness or flowering responses to all climbers.

## 8. Outputs and evaluation

Required outputs for each run:

1. 3-D architecture plus root-station and support-contact graph by plant and age cohort.
2. Monthly projected foliage coverage and separate **winter evergreen** coverage from specified viewing points.
3. Flower presence/colour density by species and height zone, with individual buds/flower ages tracked where supported.
4. Route coverage on timber and cables, available/unoccupied routes, contacts with declared exclusions, and the length of visible steel.
5. Chronological gardener action log and required maintenance hours/tasks (hours initially uncertain).
6. Plant health alerts, shading conflicts, growth beyond inspection zones and failed attachment events.
7. Mass/area *proxies* and sensitivity envelopes with explicit **not engineering validated** status.
8. An assumptions/provenance report revealing which numbers were empirical versus placeholders.

### Non-goals in the first iteration

Exact flowering dates, exact year-to-full-canopy prediction, 10–30-year timber forces, physiological carbon accounting, explicit pest outbreaks, climate-change predictions and full ecological habitat simulation. Make interfaces capable of accepting these modules later.

## 9. Core tests to design before implementation

- **Wisteria continuity:** *W. sinensis* survives dormancy without losing its mature woody graph; following-year buds depend on prior-season development.
- **Pruning response:** severing a flowering spur deletes its descendants/buds and changes predicted flowering.
- **Clematis contrast:** Group 3 *Clematis* can regrow and flower on current-season shoots after late-winter hard pruning; *C. cirrhosa* responds differently.
- **Attachment exclusivity:** a rose does not self-twine, an aerial-root species does not become a tendril climber, and a lost tie/contact can cause loss of support.
- **No-fly zones:** where a project declares an exclusion (a connection, an access hatch) nothing attaches there. None is assumed: the timber is a growing surface.
- **Hemisphere route:** 7.5 m hemisphere height requires ~11.78 m along the shortest meridian to the crown; a 7.5 m vine is **not** presumed to reach.
- **Winter realism:** deciduous canopy leaf coverage decreases, winter green is mostly the evergreen subset.
- **Human override:** a gardener training intervention can make an otherwise unsupported route attainable and is reflected in the audit trail.
- **No universal rates:** a planted age is not inferred from RHS height ÷ years to maturity.

## 10. Scientific context

See `SOURCES_AND_ASSUMPTIONS.md` for the 2026 FSPM synthesis, OpenAlea/MTG/L-Py/PlantGL documentation, climbing mechanics, and RHS profiles. Treat current equations as **structured hypotheses pending calibration**.
