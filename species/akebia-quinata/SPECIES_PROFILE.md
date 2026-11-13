# Akebia quinata

**Common name:** Chocolate vine / five-leaf akebia  
**Place in palette:** OPTION — fast semi-evergreen spring textural layer

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Vigorous semi-evergreen woody twiner with five-part leaves; stems 9 to 12 m long (Bean: 30 to 40 ft), making dense masses of growth. |
| Climbing or support mechanism | Stem twining, right-handed helix: anticlockwise seen from above. No tendrils, clinging roots or prickles. |
| RHS ultimate-height envelope | RHS: 8–12 m; 5–10 years to ultimate size class. |
| Hardiness | H6 (RHS); this does not guarantee leaves persist every winter. |
| Flower / leaf / fruit season | Fragrant flowers in hanging racemes in spring with the young leaves (RHS: early spring; Flora of China: April and May); foliage kept in mild winters, tinted purple, shed in hard ones; violet sausage-shaped fruits in September and October, seldom set in Britain. |
| Aspect and exposure | Full sun/partial shade, multiple aspects possible; broad soil tolerance. |
| Soil | Moist but well-drained. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates. Shape characters are in [`morphology.json`](morphology.json), each with its source; what the growth model assumes is in [`model.json`](model.json), each number with its status.

## Species-specific biological logic

High-vigour stem twining, semi-evergreen leaf abscission dependent on temperature/microclimate; fruit set is not guaranteed and depends on cross-pollination between clones and on a warm summer.

Two kinds of shoot, as in the floras (Flora of China, of the genus: leaves "alternate or clustered on short branches"; racemes "axillary on short branches"):

- **long shoots**, slender and twining, with one leaf at each node, which extend the plant by metres a year;
- **short branches** on wood of earlier years, a centimetre or two long, each carrying a cluster of leaves every year and, on some, a raceme in spring.

One plant carries flowers of both sexes in every raceme, but is self-incompatible: fruit needs pollen from a plant of another clone (Li et al. 2010 and Brickell 2008, both in the GB risk assessment; RHS).

## Form: what the model draws

**Leaf.** A hand of five leaflets (now and then four) on a slender stalk longer than the leaflets: stalk 4.5 to 10 cm, leaflets 2 to 5 cm long and 1.5 to 2.5 cm wide, each on its own stalk of about a centimetre, the middle one's longest. The leaflets are obovate, entire, rounded and notched at the tip with a small point in the notch, folded a little along a sunken midrib. They lie flat round the top of the stalk, the side pair about 66 degrees from the end leaflet and the lowest pair about 132, pointing back (read off a photograph). The leaflet has a texture of its own: a pale, sunken midrib and five to seven faint side veins looping forward, the net barely showing, as photographs show it; the bold herringbone of the shared texture was a wisteria leaflet's. Above it is a dark, slightly grey green, matt to satin. The stalk goes where the engine points it, lying out across the face of the plant; the viewer turns the hand at its top to face the open side, tilted 15 to 55 degrees to the sky against the trellis and 40 to 80 out in the open, and turned every way round. One unit of the model is the whole leaf, 8.5 to 17.5 cm, which is what `organs.leafLengthM` grows.

**Through the year, as the model shows it.** From early March the short branches break: leaves unfold over March and April, a fresh yellow-green flushed bronze at first. The racemes lengthen with them and open from late March to mid April, so that the plant flowers among half-grown leaves; all are over by mid May. Long shoots extend from March to early October, hang and arch over under their own weight and twine on what they reach. The foliage is green through summer; from late October it takes a purple tint, and through December seven leaves in ten fall. The other three stay on through winter and are shed as the new leaves open in spring. Where fruit has set it hangs pale green through summer, colours greyish lilac in September and October, and is gone by the end of November.

**Raceme.** Hanging, 6 to 12 cm long, from a short branch, with a few bud scales at its foot. Where the bare stalk ends (about 2.75 cm of the 9 drawn; Flora of China: "ca. 2.5 cm") stand one or two female flowers on stalks of 2 to 4 cm that carry them out to the side, nodding: each of three broad, concave, dark chocolate-purple sepals, 2 to 3 cm across, with three to six dark carpels standing apart in the middle, each tipped with a pale sticky stigma. Below them, crowded towards the tip, are four to ten male flowers on stalks under a centimetre: three small rose-mauve sepals, hooded and spreading in a shallow nodding cup, and six stamens curled in on one another in a dark knot; each flower about 1.3 cm across. The female flowers open first and the male ones after them, base to tip. There are no petals.

**Fruit.** A fleshy follicle from each carpel that sets: sausage-shaped, 5 to 8 cm long and 3 to 4 cm thick, hanging by the stalk the flower had, singly, or two or three splayed from the end of the stalk like the fingers of an open hand (35 to 80 degrees from plumb, read off photographs). Pale green with russet flecks and a bloom, colouring a greyish lilac.

**Stems.** Young shoots about 2.5 mm thick, green, turning red-brown in their first year; older stems a pale to mid grey-brown, nearly smooth with only light furrows (as photographs of old plants show them, smoother than the dendrology fact sheet's "interlacing ridges and furrows"), and slender still: a ten-year-old plant's main stem is 2 to 2.7 cm thick at the foot.

**Habit on a trellis.** A plant on the specimen frame (a 2.4 by 2.6 m trellis of laths, a post and three cables), trained (tied in, never cut: no routine is modelled for it), seed 7: reaches the top in its second year, holds nine tenths of the routes by its fourth, and by its sixth carries 124 m of stem on the lattice, some 850 short branches, 6,700 leaves in July and 180 racemes, about 150 of them open together in mid April; by its tenth 147 m, 1,280 short branches, 9,700 leaves and 440 racemes (some 3,500 flowers), with about a quarter of the timber still seen from the south in July and 52% of the view in leaf. In January of the tenth year some 2,850 leaves are still on. Left alone it twines laths and cables unaided and leaves the 150 mm post bare; tied in, it is led along the post as well. Long shoots of the year hang and arch over the top of the frame and down its faces; those that found no hold stay as bare threads (see below).

**Where the model simplifies, or is wrong.**

- *Winter.* The plant is semi-evergreen: three leaves in ten are kept through winter (`organs.winterLeafShare`, a choice; no source gives a share). The engine draws a kept leaf green all winter, where the RHS has the foliage "tinted purple in winter" and an April photograph from Lublin shows the kept leaves a dull purple-brown; and the leaves that are kept do not take the late-autumn tint either.
- *Leaves fill the bays only partly.* Leaves of short branches stand on stems that lie along the laths, so the foliage follows the timber in bands with the stalks lying out across the bays; the bays between stay more open than on a real plant at six years (about 46% of the face in leaf from the south against a wall nearly hidden in photographs of old plants). Long shoots of the year now hang and arch under their weight and take hold where they pass a support. A long shoot that found no hold stays in the model as a bare thread after its first year; a real one carries short leafy branches from its second year whether or not it holds, or dies back, or is cut: the engine grows short branches only on framework.
- *Leaf sizes.* Leaves of short branches are drawn 8 to 16 cm, those of long shoots 8.5 to 17.5 cm; no source says how they differ.
- *The underside of the leaf* is glaucous (Flora of China) and is drawn the colour of the upper side.
- *Buds* are drawn as small open flowers; real ones are closed globes.
- *The fruit does not split.* A ripe follicle opens along one side to show white pulp and black seeds. The model can only change a fruit's size and colour, so the seam is drawn as a pale line.
- *Fruit set* is a fixed small share of racemes (3 in 100). In Britain it depends on a second clone within reach of pollinators and on a long hot summer; the engine knows neither, and a planting of one clone should be given none.
- *Lenticels*, which dot the stems, and the scaly winter buds are not drawn.
- *Twining* is drawn as a regular helix; nothing is known of how closely this plant coils or how thick a support it can take.
- *A raceme to a short branch.* The engine gives a short branch one flower bud a year; the Flora of China has the racemes clustered.

## Light, aspect and shelter

What the sources say, kept apart: light is what the light model acts on; warmth, frost and shelter are reported and not modelled.

| Question | What the sources say |
|---|---|
| Classes of light accepted | **Full sun and partial shade** (RHS plant record). Sources outside Britain add shade: "prefers partial shade but succeeds in full sun", and "succeeds on shady walls" (Useful Temperate Plants, after Bean and Huxley); full sun to deep shade (NC State Extension); "shade tolerant" (Purdue Arboretum); tolerant of shade and found in open or semi-shaded forest edges (Weber 2003, in the GB risk assessment). The RHS does not list full shade. |
| Aspect | **Any**: south-, north-, west- or east-facing (RHS). The aspect is not asked for light. |
| Is an aspect or shelter asked for warmth or against frost? | Yes, by some: young plants can be tender, new growth in spring "can be damaged even by light frosts", and a position sheltered from the early morning sun is advised (Useful Temperate Plants); the flowers are "prone to damage from late frosts" and the plant is "best grown in warmer gardens ... ideally with some shelter" (BBC Gardeners' World). The RHS gives exposure as "exposed or sheltered" and hardiness H6. These are about frost and warmth, not light. |
| What shade does to growth | Little that is recorded: it grows in woodland and on shaded walls and its shade tolerance is one reason it is invasive elsewhere (GB risk assessment). No source read gives a rate in shade. |
| What shade does to flowering | Fewer flowers. Stems that creep along the ground flower little, and those that climb into the light flower most profusely (Zou et al. 2023, of the genus). No source read gives a threshold. |
| What fruiting needs | Warmth, not light as such: "long, hot summers" and a second plant for cross-pollination (RHS; Brickell 2008 in the GB risk assessment: "warm springs and long, hot summers to fruit well"). |
| Too much sun or exposure | No source read reports scorch in full sun in Britain. Cold exposure costs it its leaves in winter (Bean: leafless "where conditions are more severe"), and late frost its flowers and first growth. |

`taxon.json` records the RHS sentence only ("Full sun or partial shade; several aspects possible"), which the light model reads as: accepts full sun and partial shade, no aspect asked for, flowering not tied to sun. The last is weaker than the evidence above (Zou et al. 2023); the file has not been changed here.

## What Bower must provide: local supports

Strong guided twining route with clear growth boundaries and gardening access. It twines laths and cables unaided; a post or rib too stout for it to wind round needs it tied in. How stout that is has not been measured.

## Global structure placement logic

Optional textural strip, not mixed unbounded with main wisteria and Vitis lanes.

## Gardener intervention / pruning

Prune after flowering to limit vigour, inspect spread and decide whether fruits should develop.

## Care: what the gardener does

- **Pruning group.** RHS pruning group 11, the vigorous climbers, among them "Akebia, Eccremocarpus, honeysuckle (Lonicera), Parthenocissus, Trachelospermum, Vitis" (RHS, Climbers and wall shrubs: pruning established plants, https://www.rhs.org.uk/plants/types/climbers/established-pruning-guide). The guide: "No regular pruning needed"; trim where needed to keep the plant to its space, taking more from the longer shoots. When: "Those that flower on the previous year's growth should be pruned after flowering". The RHS plant record (https://www.rhs.org.uk/plants/747/akebia-quinata/details) gives pruning group 11, prune "after flowering".
- **What that means on a Bower.** Akebia flowers in April from short branches on wood of earlier years (Flora of China), so it is pruned when the racemes are over, late May or early June. Long shoots of the year that have found nothing and hang out from the timber are cut back to the framework, and any growth beyond the envelope taken off; the framework and its short branches, which carry next year's flowers, are kept. A second, lighter trim in late summer takes the long shoots made since. Shoots that have twined on to the lattice are left: they are next year's framework. Nothing is tied in that twines by itself; a shoot leaning out from the post may be laid on to a lath.
- **What the model does.** The trained run ties the plant in and never cuts it (no routine for this taxon in `packages/core/src/sim/planting.ts`). Its long shoots that found no hold therefore stay on as bare threads hanging from the frame, and in the winter stills they are what a gardener would have cut away. The routine, written in the engine's own events, for the integrator to add (every year from the third, when the plant first flowers):
  - 5 June: `trim_to_bounds`, `freeBeyondM: 0.3`: every long shoot that holds nothing and stands more than 0.3 m out from where it left the timber is cut off there, with all it carries (RHS group 11, "after flowering"; the racemes are over by mid May in the model).
  - 1 September: `trim_to_bounds`, `freeBeyondM: 0.5`: the long shoots made since June, the same way, more lightly (RHS: trim where needed to keep the plant to its space).
  The distances are choices: the RHS gives none.
- Flowering wood is the previous season's or older: inferred from that RHS timing and from Flora of China, which describes the racemes as axillary on short branches.

## Interactions with the broader palette

Offers spring flowering and foliage; can overshadow smaller seasonal plants; review regional invasiveness status before use.

## Risks, exclusions and scientific caveats

**GB status: check before specifying.** Not listed, but the GB Non-Native Species Secretariat rates it medium risk and it is one of five plants the GB Committee is considering for the list of species of special concern, which would ban its sale and planting. The Secretariat's own page, read on 11 November 2026 and current to at least September 2026, shows no recommendation and no ministerial decision. Invasive in some other regions; a UK-appropriate planting option is not a globally appropriate species. Semi-evergreen is not permanent green cover in every winter.

## Parameters to obtain or calibrate

Semi-evergreen winter retention by climate, twining speed/support preference, flowering timing, lateral overtake rate, fruit-pollination relationship.

What a measurement would settle, in the order the model leans on it:

1. The length of an internode and the thickness of a young shoot (a ruler on ten long shoots): `organs.leafSpacingM`, `thickening.tipRadiusSquaredMm2`.
2. How many short branches a metre of old stem carries, how many leaves each has, and what share carry a raceme (a count on a few metres of a plant in April): `organs.spurChance`, `organs.spurLeafCount`, `flowering.spurFloralChance`.
3. How many new long shoots an established plant throws in a year, how far each reaches before it arches over, and what becomes of those that find no hold: `organs.whipShareOfNodes`, `organs.whipLengthM`.
4. The thickest support it winds round unaided, and the pitch of its coil on a lath and on a cable: `attachment.maxGraspDiameterMm`, `attachment.minPitchM`.
5. British dates of leafing, flowering, purple tinting and leaf fall, and the share of leaves kept through a winter by its lowest temperature.
6. Yearly extension of a leading stem in a British summer: `extension.leaderMPerSeason`.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json), [`model.json`](model.json) and [`morphology.json`](morphology.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/747/akebia-quinata/details
- Bean, Trees and Shrubs Hardy in the British Isles (Trees and Shrubs Online): https://www.treesandshrubsonline.org/articles/akebia/akebia-quinata/
- Flora of China, Akebia quinata: https://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id=200008288 and the genus: https://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id=100921
- Flora of North America, Akebia quinata: https://floranorthamerica.org/Akebia_quinata
- Flora Reipublicae Popularis Sinicae, in an English rendering: https://baike.baidu.com/en/item/Akebia%20quinata/25006
- Zou et al. 2023, Germplasm resources and genetic improvement of Akebia, Plant Diversity 45: https://pmc.ncbi.nlm.nih.gov/articles/PMC10772107
- Huang et al. 2022, The Akebia genus as a novel forest crop, Frontiers in Plant Science 13:936571: https://www.frontiersin.org/articles/10.3389/fpls.2022.936571/full
- Darwin, The Movements and Habits of Climbing Plants: https://www.gutenberg.org/files/2485/2485-h/2485-h.htm
- GB NNSS risk assessment: https://www.nonnativespecies.org/assets/Uploads/Akebia-quinata-RA-final_topub-v2.pdf
- NNSS, species of special concern: https://www.nonnativespecies.org/legislation/species-of-special-concern
- Virginia Tech dendrology fact sheet: https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=948
- NC State Extension: https://plants.ces.ncsu.edu/plants/akebia-quinata/
- Purdue Arboretum: https://www.arboretum.purdue.edu/explorer/plants/21318
- Oregon State University landscape plants: https://landscapeplants.oregonstate.edu/plants/akebia-quinata
- University of Michigan CLIMBERS: https://climbers.lsa.umich.edu/akebia-quinata/
- Useful Temperate Plants: https://temperate.theferns.info/plant/Akebia+quinata
- BBC Gardeners' World: https://www.gardenersworld.com/plants/akebia-quinata/
- Chinese Pharmacopoeia 2020, the stem as a drug, as given by ShennongAlpha: https://shennongalpha.westlake.edu.cn/knowledge/nmm-00b1

The efloras pages of the Flora of China refuse automated readers; the treatment itself (Flora of China 6: 441-443, 2001, genus and species) was read in full in its published PDF at https://www.iplant.cn/foc/pdf/Akebia.pdf, and every Flora of China figure in `morphology.json` and `model.json` was checked against it (one wording was corrected: the stamens are "straight at first, incurved at length"). The Flora of North America page refuses automated readers and was not read: no value rests on it alone, and the values that once did are now labelled assumptions. Bean, the RHS record and pruning guide, Virginia Tech, NC State, Purdue, University of Michigan CLIMBERS, Useful Temperate Plants and BBC Gardeners' World were read for the quotations given.

**Status:** morphology sourced and drawn; growth model running on labelled assumptions, none measured on a plant; site fit and GB status must be reviewed before use.

**Note of 13 November 2026: the routine of care is now modelled.** Where this profile says that no routine is modelled for this plant, or that the model does not act on its care, that was so when it was written. The trained plant now has its routine (`MODELLED_ROUTINE` in `packages/core/src/sim/planting.ts`; `docs/ASSUMPTIONS_AUDIT.md` section 13): each year from the third, shoots that hold nothing are cut off where they stand more than 0.3 m from the timber on 5 June and more than 0.5 m on 1 September.
