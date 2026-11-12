# SOURCES_AND_ASSUMPTIONS — evidence and unknowns

## Evidence policy

**RHS profiles** support approximate UK horticultural range, mature-height **categories**, habit, exposure, hardiness and flowering descriptions. They generally **do not establish** shoot extension distributions, structural loads, maximum graspable member diameter, attachment force, root volume or exact flower date. Treat cultivar pages as cultivar-specific.

**Published research** can support functional relationships; transfer to a different climber, age, support or climate must be justified.

**Architectural hypotheses** include winter-cover targets, route assignments, number of wisteria root stations, separate trellis geometry and fixed visual goals. They are not validated botanical predictions.

## General scientific and horticultural sources

- Morales A, de Vries J, Smoleňová K, Bongers FJ, Evers JB (2026), *Elements of a functional–structural plant model*, *in silico Plants* 8(2) — https://doi.org/10.1093/insilicoplants/diag023
- Goriely A, Neukirch S (2006), *Mechanics of Climbing and Attachment in Twining Plants*, *Physical Review Letters* 97, 184302 — https://doi.org/10.1103/PhysRevLett.97.184302
- Klimm F, Schmier S, Bohn HF, Kleiser S, Thielen M, Speck T (2022), *Biomechanics of tendrils and adhesive pads of the climbing passion flower* Passiflora discophora, *Journal of Experimental Botany* 73(4): 1190–1203 — https://doi.org/10.1093/jxb/erab456 (open copy: https://pmc.ncbi.nlm.nih.gov/articles/PMC8866636/). **Scope caution:** one *Passiflora* species whose tendrils end in adhesive pads. It supports the general statements made here about contact-triggered coiling; it is not a study of *Vitis* and gives no grasp dimensions for *V. coignetiae*.
- Hattermann T, Petit-Bagnard L, Heinz C, Heuret P, Rowe NP (2022), *Mind the gap: reach and mechanical diversity of searcher shoots in climbing plants*, *Frontiers in Forests and Global Change* 5:836247 — https://doi.org/10.3389/ffgc.2022.836247. **Scope:** 29 species, none of them a taxon of this library; used for the range of reach and of stiffness of shoots that hold themselves in the air, not for any one plant.
- Chelakkot R, Mahadevan L (2017), *On the growth and form of shoots*, *Journal of the Royal Society Interface* 14:20170001 — https://doi.org/10.1098/rsif.2017.0001
- Isnard S, Rowe NP, Speck T (2003), *Growth habit and mechanical architecture of the sand dune-adapted climber* Clematis flammula *var.* maritima, *Annals of Botany* 91(4): 407–417 — https://doi.org/10.1093/aob/mcg044
- Darwin C (1875), *The Movements and Habits of Climbing Plants*, 2nd edition — https://www.gutenberg.org/ebooks/2485
- RHS: Climbers and attachment mechanisms — https://www.rhs.org.uk/plants/types/climbers
- RHS: How to tie-in climbers — https://www.rhs.org.uk/plants/types/climbers/how-to-tie-in-climbers
- RHS: Wisteria pruning — https://www.rhs.org.uk/plants/wisteria/pruning-guide
- RHS: Wisteria flowering FAQ (buds induced in late summer the previous year) — https://www.rhs.org.uk/plants/wisteria/frequently-asked-questions
- RHS: Wisteria growing guide (including differences in twining orientation) — https://www.rhs.org.uk/plants/wisteria/growing-guide
- RHS: Clematis Group 3 pruning — https://www.rhs.org.uk/plants/clematis/group-three-pruning-guide
- RHS: Climbing hydrangeas — https://www.rhs.org.uk/plants/hydrangea/climbing
- RHS: Ivy on buildings (wooden-structure and load cautions) — https://www.rhs.org.uk/prevention-protection/ivy-on-buildings
- OpenAlea modelling (MTG, L-Py and PlantGL) — https://openalea.readthedocs.io/en/latest/packages/modelling.html
- OpenAlea Multiscale Tree Graph — https://mtg.readthedocs.io/en/stable/user/api_mtg.html
- Accepted name *Clematis armandi* (Kew POWO) — https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A709497-1

## Per-species bibliography

Each `SPECIES_PROFILE.md` contains its direct RHS profile URL. The species profiles are initial handoff notes, **not a comprehensive literature review** of each plant's architectural physiology.

## Explicit assumptions and unresolved data

| Claim or value | Status | What must happen |
|---|---|---|
| RHS “ultimate height” categories | Published UK horticulture range | Do not translate directly to route coverage or yearly growth |
| 15-m diameter hemispherical meridional arc = 11.78m | Geometric consequence for an ideal hemisphere | Recompute for every actual curved support path |
| Target 25–40% of selected visible zones winter evergreen | **Bower visual design hypothesis** | Test with renderings and maintenance/ecology input |
| Three wisteria root stations on a 15-m diameter reference shell | Preliminary design concept only | Recalculate with rooting plan and growth path analysis |
| Stem extension, internode geometry, branching rate, wood thickening | Unknown for this system | Literature + physical observations + distributions |
| Attachment diameter, pressure and slip limits | Unknown | Prototype with actual timber members, cables and trained plants |
| Stiffness, density and leaf weight of a young shoot; how far it holds itself out; how near a support it must come to take hold | Unknown for every taxon here; one generic set of labelled assumptions is used (`packages/core/src/sim/generic-shoot.ts`) | Bend, weigh and measure shoots of the year on real plants: a bending test on a 0.3 m length, the mass of ten leaves, the longest shoot that still holds itself level, the diameter of a shoot 0.2 m behind its tip |
| Floral chilling/forcing thresholds | Unknown by cultivar | Study and calibrate, do not manufacture thresholds |
| Light/water competition coefficients | Unknown | Start qualitative/aggregated; measure later |
| Structure biomass and wind action | **Not engineered** | Structural-engineer testing and design, not renderer data |
| Winter survival/evergreen retention | Site-dependent | Exposure, cold duration and water availability testing |
| Public safety, toxicity, ecological and invasive status | Jurisdiction-specific | Horticultural and ecological review before a real deployment |

## Provenance record template (documentation only)

For every trait eventually measured or entered: **taxon/cultivar; parameter name; value or distribution; units; plant age; season/site; source URL/DOI or observation ID; measurement method; uncertainty; reviewer; status.**

Status is one of the eight canonical evidence statuses defined in `SIMULATION_KEY.md` section 3 and `packages/core/src/vocab.ts`: `measured`, `peer_reviewed`, `published_plant_profile`, `calibrated`, `provisional_design_assumption`, `design_target`, `site_dependent`, `unknown`. (Earlier drafts of this template used the shorter words `published` and `model assumption`; they correspond to `published_plant_profile` or `peer_reviewed`, and to `provisional_design_assumption`.)

## Caveat on names and cultivars

- Use accepted taxon labels when the authoritative source is clear; *Clematis armandi* replaces the earlier informal *armandii* spelling. (Checked 11 November 2026: IPNI record 709497-1, Kew's World Checklist and the RHS all use *armandi*.)
- RHS uses multiple commercial and synonym labels for some cultivars (e.g., *Clematis* 'Étoile Violette' and *Rosa* 'The Generous Gardener'). Store an accepted display name **and** aliases in the data structure: `species/<id>/taxon.json`, field `names`.
- **Five working labels in these documents are not the currently accepted name.** They are kept as labels and folder ids because they are the names the plants are sold under; the accepted names are listed in the taxonomic note in `KEY.md` section 2 and recorded per taxon. Checked 11 November 2026 against RHS plant records and Kew's World Checklist of Vascular Plants (June 2026 release, read through GBIF because Kew's POWO site refuses automated access).
- A cultivar-specific mature size/flowering description cannot safely be inherited from its generic species if the cultivar profile differs.
