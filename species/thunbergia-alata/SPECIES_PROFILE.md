# Thunbergia alata

**Common name:** Black-eyed Susan vine  
**Place in palette:** CORE ANNUAL OPTION — replaceable warm-season colour

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Tender evergreen perennial in frost-free climates, **grown as an annual outdoors in UK**. A slender, soft, hairy herb with many twining stems; nothing of it turns to wood in one British summer. |
| Climbing or support mechanism | Herbaceous stem twining, right-handed helix: anticlockwise seen from above (Darwin: "moves against the sun"). No tendrils, no coiling leaf stalks, no rootlets. |
| RHS ultimate-height envelope | RHS: 1.5–2.5 m high, 0.5–1 m across; 1–2 years to ultimate size category; seasonal performance depends on stock and warmth. Breeder's vine length for the Susie series: 1.8–2 m. |
| Hardiness | H2 (RHS: 1 to 5 °C, "not surviving being frozen"), not winter-hardy outdoors in the UK. |
| Flower / leaf / fruit season | Orange (also yellow, cream or white in seed strains) with a dark eye; "from summer to early autumn" (RHS), in practice from late June or July until the cold stops it. Capsules ripen behind the flowers from late summer. Nothing above ground from the first hard frost until it is replanted in May. |
| Aspect and exposure | Sunny, warm, sheltered. See "Light, aspect and shelter" below. |
| Soil | Free-draining soil with reliable moisture. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Species-specific biological logic

Short-season establishment, rapid herbaceous internode extension, late-season death/reset or removal outdoors.

- **Day-neutral, and quick.** It flowers six to ten weeks from seed whatever the day length (PanAmerican Seed), so a pot plant set out in May is held back by nothing but its size and the warmth.
- **Flowers stand singly in the leaf axils** of every stem as it lengthens, each on its own long stalk; there is no flowering shoot and no flush. More stem means more flowers.
- **It branches from the leaf axils all summer**, and every branch twines like the stem that bears it.
- **The corolla drops whole**; the two bracts stay, and where the flower was pollinated a beaked capsule ripens inside them, dries and splits.
- **Cold ends it.** Growth slows as nights cool and the first hard frost kills the whole plant.

## Form: what the model draws

The strain drawn is the orange, dark-eyed form of the species (sold as 'Susie Orange with Black Eye' and the like). Shape numbers are in [`morphology.json`](morphology.json), each with its source and evidence status; growth numbers in [`model.json`](model.json).

**Through the year.** From November to mid May there is nothing: the frame is bare. A pot plant is set out on 20 May. By midsummer it is a loose column of thread-thin stems about a metre high, each carrying pairs of leaves a hand's width apart, the stems roped together up whatever they have hold of. The first flowers open at the turn of June and July. Through August and September the stems lengthen to between 1.5 and 2.4 m and the plant is at its fullest, with ten to twenty flowers out at once in August, twenty-five to thirty in mid September and about forty at the start of October, on some 35 m of stem and 630 leaves; among the leaves stand many more pairs of pale bracts, some holding buds and some what follows the flower. Capsules follow from August and are tan by October. It stays green to the end: in the first week of November the cold kills the plant and everything it carried goes with it.

**Stem.** Green, soft, hairy, flushing a dull purplish brown along its older lengths, drawn 1.6 mm thick. It winds up a cane, string or cable anticlockwise as seen from above. Several stems share one support and rope together into a column. It cannot grasp a 40 mm lath or a glulam post: on timber it has to be tied.

**Leaf.** In opposite pairs. A broad arrow- to heart-shaped blade, 3 to 8 cm long and from a little over half to nearly as wide, widest across its two rounded basal lobes and drawn to a point at the tip, with one to three blunt angles down each side and a slightly wavy margin. Five main veins spread from the top of the stalk and the blade is quilted between them. The stalk, 2.5 to 3.5 cm, is winged on both sides, the wing widening into the blade: this is what *alata* means. A fresh mid green, soft, without gloss; bright yellow-green as it unfolds. The blade hangs from the stalk, tip down and face outwards.

**Flower.** Single, on a slender stalk 3 to 9.5 cm long from the leaf axil, which rises and then nods so that the flower looks out and a little up. Two pale green ridged bracts (12 to 20 mm), paler and yellower than the leaves, close round the base into a pod and hide a tiny toothed calyx. A pale tube 15 to 25 mm long comes out between them and opens flat into five lobes, each widening from the mouth to a square end with rounded corners and a shallow notch, joined edge to edge near the mouth and standing free of one another in their outer half like the blades of a propeller; 3 to 4 cm across in all. Clear orange, a shade deeper towards the middle, round a small sharply edged eye of dark purple, about a fifth of the flower's width, that is near black in the depth of the tube. The four stamens and the style stay inside the tube and do not show. The bud is the pod of the two bracts with the furled corolla just showing at its tip. The corolla falls in one piece and leaves the bracts.

**Fruit.** On the same stalk, between the same two bracts, now folded and standing apart: a hairy capsule with a low round base 5 to 10 mm across, in two swellings, and a stout beak 9 to 15 mm long, "resembling a bird's head". Green, drying to a khaki tan.

**Where the model simplifies, or cannot follow the plant.**

- *Branching.* The engine breaks a bud into a branch only in the spring after it was laid down, and this plant has no second spring. Its branches are therefore entered as further stems from the base: eighteen stems in all, starting together on planting day. A real plant has a few stems from the base and many branches higher up, starting through the summer.
- *One flower to a node.* Each node has two leaf axils and each can carry a flower; the engine allows one flower a year at a node.
- *When a flower opens.* A real flower opens two or three weeks after its node is made, so the flowers follow the growing tips. The engine opens each on a day drawn between then and the end of the season, so flowers are spread along the whole stem and the display builds to a peak just before the season's last opening day (7 October), then stops at once.
- *Thickness.* Stems are thickened at the year's end, and this plant is dead by then: every stem is drawn the thickness of a young shoot for its whole life. The foot of a real plant is perhaps 3 mm thick by autumn.
- *Light.* Leaves and flowers are set round the stem by rule. A real plant turns its leaf blades and its flowers to the light, which is what makes it read as a sheet of leaf and flower from the sunny side.
- *The fruiting stalk.* When a flower is over the engine removes it and, where it set, starts a fruit from nothing. The stalk and bracts of the drawn capsule therefore grow again from a point, where in life they are already full size.
- *The lifetime of a corolla.* The viewer shows the corolla for the first three fifths of the days the engine counts a flower as open, and the bare bracts after that.
- *Leaf underside, and the back of the flower.* The leaf is paler beneath with prominent veins, and the back of the lobes a paler orange; each is drawn in one colour on both faces.
- *How the blade hangs.* In photographs the blades hang at 45 degrees and more from their stalks. A leaf model must stay nine tenths of its length along its axis, which stops the drawn blade at about 30 degrees.
- *Bracts in fruit.* Drawn green turning tan, folded and standing either side of the capsule at every age. In life they wither and hang beneath a ripe capsule.
- *Dying.* The dead plant is not drawn: it is green one day and gone the next. What the leaves of a plant in Britain do in its last cold weeks, and what a frosted plant looks like, are not recorded in any source read and are not drawn.

## Light, aspect and shelter

What the sources say, kept apart because light, warmth and shelter are three different things and the simulator's light model acts on the first only.

| Question | Finding | Source |
|---|---|---|
| Light classes accepted | **Full sun.** The RHS record lists full sun only. American extension services add partial shade as tolerated (North Carolina State: full sun, 6 hours or more, or partial shade, 2 to 6 hours; Singapore NParks: full sun or semi-shade), but those are hotter, brighter climates. Full shade: no. | RHS; NC State Extension; NParks |
| What shade does to growth | Lankier, leggier stems. | Epic Gardening ("leggy growth and few blooms" signal too little light) |
| What shade does to flowering | Fewer flowers in part shade ("tolerates partial shade but flowering may be reduced", Wisconsin Extension), none in shade ("Plants will not flower in shade", RHS genus page). | Wisconsin Extension; RHS |
| Aspect | South- or west-facing (RHS). Asked for **warmth** at least as much as for light: it is a tropical African plant rated H2, set out only when nights stay above 10 °C. No source says so in as many words; the RHS gives aspect and hardiness side by side without linking them. | RHS |
| Shelter | **Sheltered** (RHS; Sarah Raven: "a sheltered, sunny spot"). For **wind and warmth**, not light: the stems are a millimetre or two thick and the leaves soft ("they prefer protected locations out of the wind", Epic Gardening). | RHS; Sarah Raven; Epic Gardening |
| Too much sun or exposure | In hot climates, scorched leaves and drooping in the heat of the day under midday sun; some afternoon shade is recommended there (NC State). Not reported for Britain, where the usual trouble is too little warmth. Under glass in hot dry air: red spider mite, whitefly (RHS). | NC State; Epic Gardening; RHS |

For the light model: the profile sentence "Sunny, warm, sheltered." reads as full sun only, with flowering tied to sun. On the open specimen frame the model gives it 0.89 of the extension it would have in the open, from the shade of the frame's own timber.

## What Bower must provide: local supports

Light, **removable** fine trellis and accessible replacement root pocket; not part of the permanent upper woody scaffold.

It twines string, canes, netting, wire and slender cables by itself. Darwin grew a dozen plants on sticks of various thicknesses and on string and all of them twined; no source gives the thickest support it can hold. The model takes 20 mm as the limit, so the 40 mm laths and the glulam of a Bower need ties, or a string or cable beside them.

## Global structure placement logic

Pedestrian-level colour pockets ~1.5–2.5m, especially during early permanent-climber establishment years.

## Gardener intervention / pruning

Gardener replants each late spring after frost risk, trains shoots, waters, removes annual vines when they decline; replacement annual event explicit. No pruning (RHS: "no pruning is needed outdoors").

## Interactions with the broader palette

Provides temporary vibrant colour, but should not choke long-lived young clematis and wisteria leaders.

## Risks, exclusions and scientific caveats

Not a solution for winter flowers or evergreen coverage in a UK freestanding Bower. A weed of warm countries (it seeds itself and roots from stem fragments in Queensland); in Britain the frost prevents that.

## Parameters to obtain or calibrate

Measured on plants grown in Britain, bound to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Missing values stay empty rather than being extrapolated from species names or RHS maturity classes.

- Stem made by one plant in a summer, in total and per shoot, and how many shoots it has by month.
- Distance between leaf pairs (the 4.5 to 13 cm used is from an article that names no flora).
- How many of the two axils at a node flower, how long after the node is made, and how many days a corolla lasts.
- How many flowers are open at once on one plant, by week.
- Share of flowers that set a capsule outdoors in Britain, and the days from flower to ripe capsule.
- The thickest support a stem will twine, and the pitch of its coils on a 5 mm cable and a 12 mm cane.
- Stem thickness at the tip and at the foot in September.
- Dates: first flower from a mid-May planting, last flower, first yellowing, death.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json), [`model.json`](model.json) and [`morphology.json`](morphology.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/66108/thunbergia-alata/details
- RHS genus page: https://www.rhs.org.uk/plants/thunbergia
- RHS Plants, 'Susie Orange with Black Eye': https://www.rhsplants.co.uk/plants/_/thunbergia-alata-susie-orange-with-black-eye-susie-series/classid.2000028594/
- Wasshausen & Wood (2004), Acanthaceae of Bolivia, Contributions from the United States National Herbarium 49: https://sweetgum.nybg.org/science/vh/monographs-details/?irn=56530
- Australian Tropical Rainforest Plants (CSIRO): https://apps.lucidcentral.org/rainforest/text/entities/Thunbergia_alata.htm
- Weeds of Australia, Biosecurity Queensland edition: https://keyserver.lucidcentral.org/weeds/data/media/Html/thunbergia_alata.htm
- Botany Brisbane: https://www.botanybrisbane.com/plants/acanthaceae/thunbergia/thunbergia-alata/
- Wisconsin Horticulture Extension (S. Mahr): https://hort.extension.wisc.edu/articles/black-eyed-susan-vine-thunbergia-alata/
- North Carolina State Extension: https://plants.ces.ncsu.edu/plants/thunbergia-alata/
- PanAmerican Seed GrowerFacts, Thunbergia Susie series: https://ballaustralia.com/wp-content/uploads/plant_list/cultural_notes/T/Thunbergia-Susie-CN.pdf
- Darwin, *The Movements and Habits of Climbing Plants*: https://www.gutenberg.org/files/2485/2485-h/2485-h.htm
- Sarah Raven, 'Superstar Orange': https://sarahraven.com/products/thunbergia-alata-superstar-orange
- Singapore NParks Flora & Fauna Web: https://www.nparks.gov.sg/florafaunaweb/flora/1/5/1518
- Epic Gardening: https://www.epicgardening.com/how-to-plant-grow-and-care-for-black-eyed-susan-vines/
- Photographs looked at for shape, posture and colour, on Wikimedia Commons (looked at, not copied; each character read from one names it in `morphology.json`): "Black Eyed Susan (Thunbergia alata) with orange flowers.jpg", "Climber at timber-framed house, Limburg.jpg", "Thunbergia alata, Hungary.jpg", "Black eyed susan flower in london.jpg", "Black-eyed Susan 2.JPG", "1024 Schwarzäugige Susanne-1858.jpg", "Schwarzäugige Susanne blühend.jpg", "Thunbergia alata close.JPG", "Thunbergia alata - plant (aka).jpg", "Mosca abeja.jpg", "Kapselfrucht.jpg", "Kapselfrucht 02.jpg", "Black Eyed Susan.JPG", "Starr 070403-9002 Thunbergia alata.jpg", "Starr-110307-2322-Thunbergia alata-flowers and leaves-Kula Botanical Garden-Maui (24449969013).jpg", "Thunbergia alata 1DS-II 1-1742.jpg".
- Not read (blocked to automated readers when this was written): Flora of China, Kew Plants of the World Online, Flora of Tropical East Africa, SANBI PlantZAfrica. They should be checked against the characters recorded here.

**Status:** morphology recorded from published descriptions; growth model gone through parameter by parameter and still uncalibrated; site fit must be reviewed.
