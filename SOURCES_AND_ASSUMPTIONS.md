# SOURCES_AND_ASSUMPTIONS — evidence and unknowns

## Evidence policy

**RHS profiles** support approximate UK horticultural range, mature-height **categories**, habit, exposure, hardiness and flowering descriptions. They generally **do not establish** shoot extension distributions, structural loads, maximum graspable member diameter, attachment force, root volume or exact flower date. Treat cultivar pages as cultivar-specific.

**Published research** can support functional relationships; transfer to a different climber, age, support or climate must be justified.

**Architectural hypotheses** include winter-cover targets, route assignments, number of wisteria root stations, separate trellis geometry and fixed visual goals. They are not validated botanical predictions.

## General scientific and horticultural sources

- Elements of a functional–structural plant model (2026), *in silico Plants* — https://doi.org/10.1093/insilicoplants/diag023
- Goriely & Neukirch (2006), *Mechanics of Climbing and Attachment in Twining Plants*, *Physical Review Letters* — https://doi.org/10.1103/PhysRevLett.97.184302
- Tendril biomechanics, *Journal of Experimental Botany* (2022) — https://pmc.ncbi.nlm.nih.gov/articles/PMC8866636/
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
| Attachment diameter, pressure and slip limits | Unknown | Prototype with actual secondary supports and trained plants |
| Floral chilling/forcing thresholds | Unknown by cultivar | Study and calibrate, do not manufacture thresholds |
| Light/water competition coefficients | Unknown | Start qualitative/aggregated; measure later |
| Structure biomass and wind action | **Not engineered** | Structural-engineer testing and design, not renderer data |
| Winter survival/evergreen retention | Site-dependent | Exposure, cold duration and water availability testing |
| Public safety, toxicity, ecological and invasive status | Jurisdiction-specific | Horticultural and ecological review before a real deployment |

## Provenance record template (documentation only)

For every trait eventually measured or entered: **taxon/cultivar; parameter name; value or distribution; units; plant age; season/site; source URL/DOI or observation ID; measurement method; uncertainty; reviewer; status (`measured`, `published`, `model assumption`, `unknown`).**

## Caveat on names and cultivars

- Use accepted taxon labels when the authoritative source is clear; *Clematis armandi* replaces the earlier informal *armandii* spelling.
- RHS uses multiple commercial and synonym labels for some cultivars (e.g., *Clematis* 'Étoile Violette' and *Rosa* 'The Generous Gardener'). Store an accepted display name **and** aliases in the eventual data structure.
- A cultivar-specific mature size/flowering description cannot safely be inherited from its generic species if the cultivar profile differs.
