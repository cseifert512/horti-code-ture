# SIMULATION_KEY — scientific model specification

## 1. Primary objective

Extend an existing generative *Wisteria sinensis* model into a **multi-taxon, gardener-managed, structure-aware functional–structural plant model (FSPM)**. The near-term purpose is to simulate **credible spatial growth, attachment, visual seasonal change, and maintenance** across a Bower. Precise ecology, carbon balance, long-term load prediction and species-specific flowering physiology are **later research tracks**, not barriers to a first usable model.

A 2026 synthesis of FSPMs organizes the problem around **plant function, geometry, topology and environment**. Keep the model modular enough that approximate functions can be replaced by calibrated ones without changing the underlying plant-support graph.

## 2. Represent two graphs, not one

**Graph A — manufactured architecture and local supports**

- `GlobalBower`: whole-shell geometry, structural members, load zones, banned-contact surfaces and maintenance access.
- `StructuralMember`: member ID, 3-D curve/solid, material, diameter/profile, orientation, curvature, junctions, inspection needs and attachments permitted.
- `LocalSupport`: cables, rods, mesh, textured replaceable strips, tie points; each has geometry, cross-section, roughness, strength specification, attachment permissions, failure/maintenance state and relationship to the main structure.
- `RootStation`: geolocation/position, available soil volume, moisture, pH, microclimate, irrigation, crowding and access.

**Graph B — each living individual**

- `TaxonProfile` (stable): accepted botanical name + cultivar, climbing mechanism, evergreen status, flowering-wood class, horticultural envelope, trait provenance and unknown parameters.
- `PlantIndividual`: unique ID, root station, provenance, age since propagation/planting, health, resource state and gardener ownership/management regime.
- `Axis / Stem / Internode`: plant-parent relationship, botanical age and cohort, 3-D geometry, diameter, fresh/woody state, mechanical orientation, growth potential, dominant/subordinate status and live/dead flag.
- `Bud`: location, creation time, developmental state (`vegetative`, `competent`, `initiated_floral`, `dormant`, `aborted`, `open`, `spent`), overwintering history, host stem identity, source/uncertainty.
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
- Classify every number as `measured`, `published_plant_profile`, `peer_reviewed`, `calibrated`, `provisional_design_assumption`, or `unknown`.
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

Evaluate each tip/contact against the local support and its mechanism (stem twining, petiole twining, tendril, aerial root, scrambling/tie, none). Enforce explicit **forbidden surfaces**, attachment duration, unsupported span, ageing/thickening and gardener-supplied tie events. A failed encounter cannot magically produce a stable climbing connection.

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

**Start with daily biological time steps**, annual multi-year runs and monthly visual output. Do not begin with a minute-by-minute photosynthesis or CFD model. Spatially, preserve individual axes/internodes and their 3-D contact with secondary support geometry; use aggregated foliage/flower cohorts until measurements justify explicit every-leaf geometry.

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
4. Support-route coverage, available/unoccupied routes and prohibited surface contacts.
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
- **No-fly zones:** no attachment onto structural exclusion surfaces or access hatches.
- **Hemisphere route:** 7.5 m hemisphere height requires ~11.78 m along the shortest meridian to the crown; a 7.5 m vine is **not** presumed to reach.
- **Winter realism:** deciduous canopy leaf coverage decreases, winter green is mostly the evergreen subset.
- **Human override:** a gardener training intervention can make an otherwise unsupported route attainable and is reflected in the audit trail.
- **No universal rates:** a planted age is not inferred from RHS height ÷ years to maturity.

## 10. Scientific context

See `SOURCES_AND_ASSUMPTIONS.md` for the 2026 FSPM synthesis, OpenAlea/MTG/L-Py/PlantGL documentation, climbing mechanics, and RHS profiles. Treat current equations as **structured hypotheses pending calibration**.
