# Trachelospermum jasminoides

**Common name:** Star jasmine  
**Place in palette:** CONDITIONAL — warm, sheltered evergreen fragrance

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Evergreen woody twiner. |
| Climbing or support mechanism | Stem twining (RHS: needs supporting wires or trellis); handedness is still not documented after a second search in November 2026, and the one photograph found of stems on canes is ambiguous. Aerial rootlets on damp rough surfaces are reported without citation and cannot be ruled out; if real, it could cling to timber as well as twine. |
| RHS ultimate-height envelope | RHS: 8–12 m; 5–10 years to ultimate size category. |
| Hardiness | H4 (RHS). |
| Flower / leaf / fruit season | Glossy dark leaves, often bronze/red in winter; exceptionally fragrant white flowers mid to late summer (RHS), in July and August (Bean). |
| Aspect and exposure | Warm full sun/partial shade, ideally south/west, **sheltered from cold winds**. |
| Soil | Fertile, well-drained; dislikes soggy conditions and summer drought. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Light, aspect and shelter

What the sources say, clause by clause. The light model reads only the sentence in `taxon.json` (`site.aspect`), which is unchanged; this section is the evidence behind it and what it leaves out.

| Question | What is recorded | Source |
|---|---|---|
| Classes of light it accepts | **Full sun and partial shade.** Full shade is not listed. | RHS plant record: "Full sun, Partial shade". RHS growing guide: "a warm, sunny or lightly shaded spot". BBC Gardeners' World: "grows best in full sun but copes with partial shade". Useful Temperate Plants (after Huxley): "requires full sun or part day shade". |
| Aspect | South, west or east facing; south or west "ideal". North is not listed. | RHS plant record: "South-facing or West-facing or East-facing". RHS growing guide: "A south- or west-facing wall or fence is ideal". |
| What the aspect is asked for | **Warmth and shelter, not light.** The same sources that ask for a south or west wall accept partial shade; what they rule out is cold: "Avoid frost-prone or cold, exposed sites"; "shelter from cold, drying winds"; hardiness H4. An east wall is accepted by the RHS record although it is the coldest of the three in winter, and a plant in Belgrade kept on a north-east facing screen between tall buildings came through -15.5 degC (Ocokoljic et al. 2026), sheltered from the two prevailing cold winds. | RHS plant record and growing guide; Ocokoljic et al. 2026. |
| Exposure | **Sheltered.** | RHS plant record: exposure "Sheltered"; "sheltered from cold winds". |
| What shade does to growth | Not stated outright by any source read. In the wild it grows on "sunny edges of forests, brushwoods" (Flora of China), so it is a plant of the lit edge and not of the forest floor. Slow growth is given as a sign of cold or low light by growers' guides only. | Flora of China 16: 167. |
| What shade does to flowering | Fewer flowers. "Best flowering occurs in a sheltered, sunny spot" (NC State Extension); it "grows best in full sun" (Gardeners' World). One uncited statement has it flowering "in full sun, partial shade, or total shade" (Wikipedia), and Useful Temperate Plants shows a photograph of it "climbing and flowering well in a shady" place; nobody gives a number. So: flowering falls with shade and does not stop in partial shade. | NC State Extension; BBC Gardeners' World; Useful Temperate Plants. |
| Too much sun | Outdoors in Britain, none recorded: full sun is the first choice. Under glass, "keep it out of direct summer sun to avoid scorching the leaves" (RHS guide). In hot, dry places against a wall it draws scale insects and red spider mite (RHS guide). | RHS growing guide. |
| Too much exposure | Cold, drying wind is the limit. "In cold snaps, leaves may turn red, develop spots, or fall. The plant should recover except in the severest winters" (RHS guide). Young plants are more tender than established ones (Bean; RHS guide: "established after two or three years and are hardier"). The winter reddening the RHS record describes as ornamental ("often turn deep bronze-red in winter") is the mild end of the same response. | RHS growing guide; Bean. |

**For the light model:** accept full sun and partial shade; hold growth back below partial shade; tie flowering to sun (a clause the present sentence in `taxon.json` does not carry, so the model does not yet apply it to this plant). **Not light, and not modelled:** the south or west aspect and the shelter are about winter cold and wind. A bright but wind-swept crown fails this plant's requirement while passing the light test.

## Species-specific biological logic

Evergreen leaf cohorts and woody extension with sensitivity to cold-wind exposure; separate survival from seasonal ornamental leaf appearance.

## What Bower must provide: local supports

Regular fine to medium cables or timber laths; sturdy tie-in during early establishment; no assumed ability to cling to flat timber.

## Global structure placement logic

Sheltered sunny edge/entrance, courtyard or lower microclimate. Avoid asserting it will thrive on an exposed high freestanding crown.

## Gardener intervention / pruning

Train/tie onto secondary wire, manage spread, inspect post-winter leaf scorch and potential dieback; replace only where unsuited.

RHS pruning group 11, in early spring: maintenance pruning is rarely needed and consists of thinning congested, weak or damaged shoots. Mulch once a year, in spring or autumn. Flowering wood is provisionally the current season's growth, on short side shoots from older stems: inferred from the RHS spring timing and Bean's description, with NC State Extension's advice to prune after flowering pointing the other way.

## Interactions with the broader palette

Useful summer-scent counterpoint to spring wisteria; possible overlap with evergreen honeysuckle, so avoid unnecessary competition.

## Risks, exclusions and scientific caveats

H4 hardiness describes cold survival, not exposed-wind tolerance. Exposed sites may turn sparse or suffer damage. The whole plant is poisonous (Flora of China); white latex when cut.

## Parameters to obtain or calibrate

Wind/cold leaf retention, flowering threshold and flower density, support grasping preference, trained growth, water stress.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/18287/trachelospermum-jasminoides/details
- Additional source: https://www.rhs.org.uk/plants/trachelospermum
- RHS growing guide: https://www.rhs.org.uk/plants/trachelospermum/growing-guide
- RHS pruning groups 11 to 13: https://www.rhs.org.uk/plants/types/climbers/established-pruning-guide
- Trees and Shrubs Online (Bean): https://www.treesandshrubsonline.org/articles/trachelospermum/trachelospermum-jasminoides/

**Status:** initial handoff profile; site fit must be reviewed, no numerical simulation calibration yet.
