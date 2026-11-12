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

**Leaf.** A hand of five leaflets (now and then four) on a slender stalk longer than the leaflets: stalk 4.5 to 10 cm, leaflets 2 to 5 cm long and 1.5 to 2.5 cm wide, each on its own stalk of about a centimetre, the middle one's longest. The leaflets are obovate, entire, rounded and notched at the tip with a small point in the notch, folded a little along a sunken midrib, with five to seven side veins to a side. They are held more or less level on a rising stalk, the lowest pair pointing back. Above they are a dark, slightly blue green and matt. One unit of the model is the whole leaf, 8.5 to 17.5 cm, which is what `organs.leafLengthM` grows.

**Through the year, as the model shows it.** From early March the short branches break: leaves unfold over March and April, small, hanging and purple-bronze at first. The racemes lengthen with them and open from late March to mid April, so that the plant flowers among half-grown leaves; all are over by mid May. Long shoots extend from March to early October. The foliage is green through summer; from late October it takes a purple tint, and in December the leaves fall. January and February show bare, slender, red-brown and grey-brown stems. Where fruit has set it hangs pale green through summer, turns greyish violet in September and October, and is gone by the end of November.

**Raceme.** Hanging, 6 to 12 cm long, from a short branch, with a few bud scales at its foot. Where the bare stalk ends stand one or two female flowers on stalks of 2 to 4 cm that carry them out to the side, nodding: each of three broad, concave, dark chocolate-purple sepals, 2 to 3 cm across, with three to six dark carpels standing apart in the middle, each tipped with a pale sticky stigma. Below them, towards the tip, are four to ten male flowers on stalks under a centimetre: three small pale purple sepals turned back, and six stamens curled in on one another in a dark knot; each flower about 1.3 cm across. The female flowers open first and the male ones after them, base to tip. There are no petals.

**Fruit.** A fleshy follicle from each carpel that sets: sausage-shaped, 5 to 8 cm long and 3 to 4 cm thick, hanging by the stalk the flower had, singly or two or three together like the fingers of a hand. Pale green with a bloom, ripening greyish violet.

**Stems.** Young shoots about 2.5 mm thick, green, turning red-brown in their first year; older stems grey-brown, slowly ridged and furrowed, and slender still: a ten-year-old plant's main stem is 2 to 2.5 cm thick at the foot.

**Habit on a trellis.** A plant on the specimen frame (a 2.4 by 2.6 m trellis of laths, a post and three cables) reaches the top in its second year, holds four fifths of the routes by its fourth or fifth, and by its tenth carries some 140 m of stem on the lattice, about a thousand short branches, 6,000 to 6,500 leaves in summer and some 200 racemes in April. Left alone it twines laths and cables unaided and leaves the 150 mm post bare; tied in, it is led along the post as well.

**Where the model simplifies, or is wrong.**

- *Winter.* The plant is semi-evergreen: in most British winters it keeps much of its foliage, purple-tinted. The engine treats every plant that is not fully evergreen as losing all its leaves, so the model is bare from January to early March. It shows the plant of a hard winter, and understates its winter cover everywhere milder.
- *Leaves do not fill the bays.* Leaves of short branches stand on stems that lie along the laths, so the foliage follows the timber in bands and the bays between stay more open than on a real plant, whose long shoots hang and twine across them. Long shoots that have found nothing to twine are drawn standing stiffly out into the air; a real one is 2 to 3 mm thick and arches over within a few tens of centimetres, hangs, and twines round whatever it meets, its own stems included. Such a shoot in the model also stays for good as a bare stick after its first year; a real one that finds no hold dies back or is cut, and one that finds a hold becomes part of the framework and carries short branches.
- *One leaf size.* Leaves of short branches are drawn nine tenths the size of those of long shoots; no source read says how they differ.
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
| Is an aspect or shelter asked for warmth or against frost? | Yes, by some: young growth in spring is damaged even by light frosts on mature plants, so a position out of the early morning sun is advised (Useful Temperate Plants); the flowers are "prone to damage from late frosts" and the plant is "best grown in warmer gardens ... ideally with some shelter" (BBC Gardeners' World). The RHS gives exposure as "exposed or sheltered" and hardiness H6. These are about frost and warmth, not light. |
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

RHS pruning group 11, after flowering. Flowering wood is provisionally the previous season's: inferred from that RHS timing and from Flora of China, which describes the racemes as axillary on short branches. The model has no pruning routine for this plant: in a trained run it is tied in and never cut, which is why its long shoots accumulate.

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

The two Flora of China pages and the Flora of North America page refuse automated readers; their figures were read through a search engine's rendering of those pages and checked against the Flora Reipublicae Popularis Sinicae rendering, Bean and the RHS. They should be read again by eye before any of them is relied on for more than a drawing.

**Status:** morphology sourced and drawn; growth model running on labelled assumptions, none measured on a plant; site fit and GB status must be reviewed before use.
