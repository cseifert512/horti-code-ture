# Vitis coignetiae

**Common name:** Crimson glory vine  
**Place in palette:** CONDITIONAL — strong autumn-colour sector

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Very vigorous deciduous woody climber of the grape family, in the wild "to the tops of the highest trees" (Bean). |
| Climbing or support mechanism | Tendrils opposite the leaves, missing at every third node (Bean); no adhesive tips, no twining stems. |
| RHS ultimate-height envelope | RHS: >12 m; described around 15 m; 10–20 years to size category. |
| Hardiness | H5 (RHS). Young spring growth can be damaged by late frost (Plants for a Future). |
| Flower / leaf / fruit season | Large dark green leaves through summer, scarlet and crimson in autumn (RHS, Bean). Tiny greenish flowers in summer (RHS), June to July (Plants for a Future), each plant in flower nine or ten days (Honma and others 2007, in Japan). Bunches of blue-black berries 1 cm across (RHS), ripe September to October (Plants for a Future) where it fruits. |
| Aspect and exposure | Sun/partial shade, preferably south/west; sheltered, well-drained site. See "Light, aspect and shelter". |
| Soil | Humus-rich, well-drained, neutral to alkaline preferred. Best autumn colour on poor or chalky soil (Provender Nurseries). |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Species-specific biological logic

Tendril-bearing nodes with large leaf-area accumulation and later autumn senescence/colour change. Red colour should be responsive to environmental/seasonal factors, not always a flat September switch.

The species is dioecious: plants are male or female, and a female sets fruit only with pollen from another vine (Honma, Shishido and Taira 2007; Kimura, Okamoto and Hirano 1998). No source read says which sex the plant in the UK trade is, so how often a garden plant fruits is not known.

## Form: what the model draws

Shape numbers are in [`morphology.json`](morphology.json), each with its source; growth numbers in [`model.json`](model.json). This section says in words what they add up to and where the model simplifies.

**The plant.** A cane is planted and is slow for two years (Plants for a Future: "often slow to establish"). From then it makes long shoots, 2 to 5 m a year by one supplier's account, which the model lays along the timber and cables as a framework of canes, three to a lath. A tendril stands opposite the leaf at two nodes in three. In the model a tendril holds nothing stouter than a 12 mm cable, which is an assumption; on timber the canes are tied in. Canes that find nothing to climb are grown as long free shoots that arch out and hang.

**Leaf.** One to a node. A broad heart with three or five shallow pointed lobes, a deeply notched base and coarse uneven teeth, ordinarily 0.10 to 0.20 m wide (Bean) on a stalk of 0.05 to 0.15 m. Five main veins fan from the top of the stalk, each with its own side veins, and the blade swells a little between them ("dimpled", Gardeners' World). Dark green above; beneath, a rusty brown felt, which the model draws as a second sheet so that the under side is the felt's colour from below. The blade hangs from the end of its stalk and curls over towards its tip. Young leaves unfold fawn under their felt (an assumption). In autumn the upper side turns scarlet and crimson and the under side a ruddy rose.

**Through the year.** Bare from late November to mid April: brown canes on the frame, last year's short shoots standing off them, old tendrils. Leaves open from late April; by the end of May the plant is more than half clothed. Full leaf from late June. Colour builds from late September and is complete in the second half of October; the leaves are down by late November. None of these dates is from a UK source: they are choices, and the weather moves them.

**Flower.** A branched panicle 0.07 to 0.12 m long (length assumed) of about 120 tiny greenish flowers, hanging. A vine's petals are shed as a cap as the flower opens, so the open flower is five stamens round a green ovary; the model opens and then drops the stamens and leaves the ovary. Mid June to early July, nine or ten days a panicle.

**Fruit.** About a third of the panicles (assumed) become a bunch of some forty berries a centimetre across, green through summer, blue-black with a bloom from September, gone by midwinter.

**Wood.** The young shoot is ribbed and covered in a greyish floss (Bean); the ripened cane is smooth and brown; old bark parts in long fibrous strips (Bean, of the genus).

**Where the model simplifies.**

- The panicle of a vine stands opposite a leaf at about the third to sixth node of a shoot, where a tendril would be, and the shoot grows on past it. The engine can put a flower at the end of a short shoot or at any node of a long one, not at a chosen node; the model takes the first. So every panicle and bunch is at the tip of a short shoot, which is wrong in a close view.
- The year's ordinary shoots are grown as short stiff shoots 0.25 to 0.8 m long that live two years and are then shed. On the plant they are the same thing as the long canes, lengthen all summer, hang under their own weight, and persist until pruned.
- A long free shoot is drawn rising in a tall arc before it falls. A real one stands about half a metre and then bends over and hangs.
- A cane is in leaf only in the year it is made. On the plant it breaks into new shoots from most of its buds the next spring.
- Tendrils that catch nothing stay on the plant in the model. On the plant they wither and drop within the season (Darwin, of the family).
- One leaf size range for the whole plant. On the plant the largest leaves, to 0.3 m, are on the strongest shoots.
- The "leaf length" the engine carries is the reach of the leaf along the line of its stalk. The blade hangs from the stalk and is nearly as wide as that length, so the disc the coverage and light figures stand a leaf in for is about a third of the area of the blade: the shade this plant casts is understated in those figures.
- The sex of the flower is not modelled. The fruit share is a guess.

## Light, aspect and shelter

| Question | What the sources say |
|---|---|
| Light classes accepted | **Full sun and partial shade** (RHS). Gardeners' World: "dappled shade or full sun". Plants for a Future: semi-shade or no shade. Full shade is not listed by any UK source read; Oregon State University alone says "sun or shade". |
| Recommended aspect, and what for | South- or west-facing (RHS, Gardeners' World). The reason given is **warmth, for fruit**: "a warm sunny position is required for the fruit to ripen" (Plants for a Future); "full sun is essential if you plan to harvest the fruit, but a little shade is fine otherwise" (Ashridge). No source read asks for a south or west aspect for the growth of the plant itself. |
| Shelter, and what for | RHS exposure: sheltered. The reasons found are **cold and frost**, not light: hardy to H5 but may not withstand "open/exposed sites" or central and northern locations (Burncoose); young spring growth can be damaged by late frosts (Plants for a Future). No source read gives wind on the large leaves as the reason, though it is the obvious one. |
| What shade does to growth | Not quantified in any source read. It is a forest climber that starts in shade and makes for the canopy (Bean: into the tallest trees of Hokkaido; Plants for a Future: "ideal for growing into large trees"), and UK sources accept partial shade without comment on vigour. |
| What shade does to flowering and fruit | Flowering in shade: nothing found. Fruit needs sun and warmth to ripen (above). |
| What shade does to autumn colour | Less colour: one UK grower says full sun "is best for the autumn leaf colour", and a German supplier that more sun gives a richer red (both seen as search excerpts only). Soil matters too: "best autumn colour on poor or chalky soils" (Provender). The model colours every leaf alike. |
| Too much sun or exposure | No source read reports scorch in sun. The limits given are cold, late frost and exposed sites. |

For the light model: accepts full sun and partial shade; aspect and shelter are about warmth and frost and are to be reported, not folded into light.

## What Bower must provide: local supports

Tendril-graspable fine cables or laths and a **bounded high-vigour route**; maintenance access for powerful growth.

Gardeners' World says it "needs wire or netting to cling to"; Ashridge that it "needs sturdy support" and is "too heavy for a weak fence". How stout a lath a tendril of this plant can hold has not been measured and decides whether the timber sub-lattice needs ties: grown untended on the specimen frame, the model's plant climbs the one cable it can reach and stops.

## Global structure placement logic

One limited visible sector; not mixed indiscriminately through a rose or small clematis framework.

## Gardener intervention / pruning

Winter and optional summer restriction pruning, tendril/route monitoring and thinning for light and structural inspection.

RHS pruning group 11, in midwinter, and in midsummer if growth must be restricted. Flowering wood is provisionally the current season's growth, inferred from grapevines, whose flowering side shoots are new shoots from spurs on older wood (RHS); nothing was found for this species. Bean, of the genus: young shoots shortened once or twice in summer and cut back hard in December or January to one or two buds; pruned later, a vine bleeds.

The model has no pruning routine for this plant: a "trained" plant is tied in and nothing is cut.

## Interactions with the broader palette

Excellent autumn colour; major light competition due to leaf size and vigour—treat overlapping corridors carefully.

## Risks, exclusions and scientific caveats

Heavy visual shading; deciduous with little winter foliage; berries and other vine parts may have pet safety issues.

## Parameters to obtain or calibrate

Tendril contact radius and nodal frequency; area and mass of large leaves; change in colour/senescence timing; annual extension.

In order of what they would change: the largest support a tendril holds; the sex of the plant supplied and whether it fruits; internode length and cane diameter by age; panicle length and flower count; UK dates of budburst, colour and leaf fall; the number and length of free canes a plant throws in a year.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json), [`model.json`](model.json) and [`morphology.json`](morphology.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/19030/vitis-coignetiae/details
- RHS pruning groups 11 to 13: https://www.rhs.org.uk/plants/types/climbers/established-pruning-guide
- RHS grapes, rod and spur pruning: https://www.rhs.org.uk/fruit/grapes/rod-and-spur-pruning-system
- Bean, Trees and Shrubs Online, the species: https://www.treesandshrubsonline.org/articles/vitis/vitis-coignetiae/
- Bean, Trees and Shrubs Online, the genus: https://www.treesandshrubsonline.org/articles/vitis/
- Oregon State University, Landscape Plants: https://landscapeplants.oregonstate.edu/plants/vitis-coignetiae
- Plants for a Future: https://pfaf.org/user/Plant.aspx?LatinName=Vitis+coignetiae
- Honma, Shishido and Taira (2007), Horticultural Research (Japan) 6(2), 229–232: https://www.jstage.jst.go.jp/article/hrj/6/2/6_2_229/_article/-char/en
- Kimura, Okamoto and Hirano (1998), Vitis 37(2), 83–86 (abstract): https://ojs.openagrar.de/index.php/VITIS/article/view/4818
- Darwin, The Movements and Habits of Climbing Plants (the common vine): https://www.gutenberg.org/ebooks/2485
- BBC Gardeners' World: https://www.gardenersworld.com/plants/vitis-coignetiae/
- Provender Nurseries factsheet: https://www.provendernurseries.co.uk/factsheets/vitis-coignetiae
- Ashridge Trees: https://ashridgetrees.co.uk/p/climbing-plants/crimson-glory-vine-vitis-coignetiae
- Burncoose Nurseries: https://www.burncoose.co.uk/site/plants.cfm?pl_id=4301

Seen only as search-engine excerpts, and so entered nowhere as published values: fassadengruen.de (annual shoot growth 2 to 5 m; more sun, richer red), a Yamagata University bulletin and a USDA germplasm record (berries to a cluster), the Korea Forest Service leaflet (panicle opposite a leaf), the Kyoto Red Data Book (leaf five-angled).

**Status:** morphology and growth model written from published descriptions; nothing measured on a plant; no photograph was compared. Site fit must be reviewed.
