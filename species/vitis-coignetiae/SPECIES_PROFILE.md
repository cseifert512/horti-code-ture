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

Shape numbers are in [`morphology.json`](morphology.json), each with its source; growth numbers in [`model.json`](model.json). This section says in words what they add up to and where the model simplifies. The look was compared with photographs of the plant on Wikimedia Commons (listed under "Source / provenance"); where a character is read from a photograph, the morphology file names the file.

**The plant.** A cane is planted and is slow for two years (Plants for a Future: "often slow to establish"), though less so than that sentence alone would make it: rooted cuttings planted out in Gifu made a longest shoot of 3.24 m in their first year and 33.5 m of new shoot each in their second (Gifu Prefecture 2003). The model lays the long shoots along the timber and cables as a framework of canes, two to a lath. From the second year the buds of the framework break into the year's shoots, six to a metre of older cane, 0.4 to 1.8 m long by autumn; the longer ones lean out, arch and hang under their own weight. Leaves stand 9 to 14 cm apart (Gifu Prefecture 2003, measured), one to a node, in two ranks (distichous, as in the genus: Gerrath and others 2001). A tendril stands opposite the leaf at two nodes in three. In the model a tendril holds nothing stouter than a 12 mm cable, which is an assumption; on timber the canes are tied in. By its sixth summer on the specimen frame the trained plant carries some 1800 leaves and covers the trellis in overlapping leaves, as plants on walls and frames do in the photographs.

**Leaf.** One to a node. Roundish, with a deep, open notch at the stalk and three or five lobes that are no more than angles with a short point; small, sharp, uneven teeth all round. Ordinarily 0.10 to 0.20 m wide (Bean) on a stalk of 0.05 to 0.15 m; what the engine calls the leaf's length is its reach from the node along the line of the stalk, 0.105 to 0.225 m, about half of it stalk. Five main veins fan from the top of the stalk, each with its own side veins, and the blade swells a little between them ("dimpled", BBC Gardeners' World). The blade is nearly flat and slopes down and outwards from the top of its long stalk, so that the leaves of a shoot lie over one another like shingles (photographs). Dark to fresh green above, the younger and sunnier leaves yellower; beneath, a tawny felt, which the model draws as a second sheet. In autumn the leaves of one plant turn crimson, scarlet and orange side by side (RHS: "scarlet and crimson"; photographs from Kent in October show orange and yellow among them), the under side warm orange through the felt.

**Through the year.** Bare from late November to mid April: on the trained plant, the framework of canes on the frame with the stubs of last year's shoots, and old tendrils still wound round the cables. Leaves open from late April on the canes, then on the year's shoots as they lengthen; full leaf from late June. Colour builds from late September and is complete in the second half of October; the leaves are down by late November. None of these dates is from a UK source: they are choices, and the weather moves them.

**Flower.** A panicle 0.07 to 0.12 m long (length assumed) of some 160 tiny greenish flowers, drawn as a narrow cone of short branches each ending in tight knots of flowers, as the common vine's is in photographs (none of this species in flower was found). A vine's petals are shed as a cap as the flower opens, so the open flower is five spreading stamens with yellow anthers round a green ovary; the model opens and then drops the stamens and leaves the ovary. Mid June to early July, nine or ten days a panicle (Honma and others 2007).

**Fruit.** About a third of the panicles (assumed) become a narrow bunch of some forty berries a centimetre across on a slender stalk, green through summer, black with a bluish bloom from September, gone by midwinter.

**Wood.** The young shoot is ribbed and covered in a greyish floss (Bean); the ripened cane is smooth and brown, about 9 mm through in the lower half of a one-year cane (Gifu Prefecture 2003); the trunk of a two-year plant is about 23 mm through (the same); old bark parts in long fibrous strips (Bean, of the genus).

**Where the model simplifies.**

- The panicle of a vine stands opposite a leaf at about the third to sixth node of a shoot, where a tendril would be, and the shoot grows on past it. The engine puts a flower at the end of a side shoot or at any node of a long one, not at a chosen node; the model takes the first. So every panicle and bunch is at the tip of one of the year's shoots, which is wrong in a close view.
- A bunch's stalk ripens dark with its berries: the fruit's ripe colour is laid over every point of the model. On the plant it stays green.
- A blade does not turn to face the light. On a shoot standing free, whose leaves stand to either side, a blade is seen edge on from the front where a real one would have turned its face out by bending its stalk.
- The year's shoots that stand straight up above the frame stop where the engine's reach for an unsupported shoot is met (0.8 m) and do not fall over. A real one bends over and hangs once it is too long to hold itself up (Bean of the genus: shoots "allowed to hang loosely").
- A side shoot lives one season: the gardener's winter cut is folded into its lifespan. On a plant left alone the year's shoots would stay and become canes.
- Tendrils that catch nothing stay on the plant in the model. On the plant they wither and drop within the season (Darwin, of the family).
- One leaf size range for the whole plant. On the plant the largest leaves, to 0.3 m, are on the strongest shoots.
- One palette ramp serves the felt beneath and the variation from leaf to leaf above: the leaves whose upper side is drawn nearest orange in autumn are also the yellower ones in summer.
- The "leaf length" the engine carries is the reach of the leaf along the line of its stalk. The blade slopes down from the stalk and is about as wide as that length, so the disc the coverage and light figures stand a leaf in for (0.56 of the length across) is about a third of the area of the blade: the shade this plant casts is understated in those figures.
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

BBC Gardeners' World says to grow it "with wire or netting to cling to"; Ashridge that it "needs sturdy support" and is "too heavy for a weak fence". How stout a lath a tendril of this plant can hold has not been measured and decides whether the timber sub-lattice needs ties: grown untended on the specimen frame, the model's plant climbs the one cable it can reach (the stay) and stops at 6 m of framework.

## Global structure placement logic

One limited visible sector; not mixed indiscriminately through a rose or small clematis framework.

## Care: what the gardener does

| When | What | Source |
|---|---|---|
| Every year, December or January (while dormant) | Cut the year's shoots "hard back ... to one or two buds", leaving a framework of canes with short spurs. Later pruning makes the vine bleed. | Bean, of the genus: "The young shoots are shortened back once or twice during the summer, and then cut hard back in December or January to one or two buds (later pruning causes bleeding)"; "The same pruning should be given to plants grown on walls." Plants for a Future: prune in winter when dormant. |
| Midsummer, once or twice (June to August) | Shorten the young shoots; tie in any that are needed to extend the framework. | Bean, of the genus (above). RHS plant record: pruning group 11, in midwinter, "and in midsummer, if restricted growth is required". |
| As needed | Trim to fit the space, "removing as much from the longer shoots as necessary". On a large structure it may need no cutting back. | RHS pruning group 11 page; BBC Gardeners' World ("won't need cutting back" on a shed or garage). |
| Establishing | Tie the canes to the timber: a tendril is assumed to hold a cable or wire but not a 40 mm lath, and the plant "needs wire or netting to cling to" (BBC Gardeners' World). | growth model, attachment.maxGraspDiameterMm |

**What the model would need to act on it.** Only the two wisterias' prunes, the Group 3 clematis's cut-down and the climbing rose's routine are modelled (`MODELLED_ROUTINE` in `packages/core/src/sim/planting.ts`). For this plant the model folds the winter cut into the lifespan of a side shoot (one season), which removes the year's shoots before spring but does not leave the spur's one or two buds as the next year's starting points, and does not touch the long canes (whips) that stand up from the top of the frame. To prune it as the sources say, the model would need two dated visits:

1. **Winter spur prune**, one day between 1 December and 31 January (bleeding begins as the sap rises): every side shoot and every free cane of the year that is not tied in as framework is cut back to its first one or two nodes (`pruning.winterBudsKept` [1, 2], already in the growth model); the buds left there are where the next year's side shoots break.
2. **Summer shortening**, one or two days between mid June and mid August: every side shoot longer than its first five or six leaves is cut back to that leaf (`pruning.summerLeavesKept` [5, 6], already in the growth model; the counts are Bean's "shortened back" made specific, an assumption), and its removed length is lost with its leaves, tendrils and any bunch beyond the cut.

Neither is run today: the trained plant is tied in and grows on.

## Interactions with the broader palette

Excellent autumn colour; major light competition due to leaf size and vigour—treat overlapping corridors carefully.

## Risks, exclusions and scientific caveats

Heavy visual shading; deciduous with little winter foliage; berries and other vine parts may have pet safety issues.

## Parameters to obtain or calibrate

Tendril contact radius and nodal frequency; area and mass of large leaves; change in colour/senescence timing; annual extension.

In order of what they would change: the largest support a tendril holds; how many of the year's shoots a spur-pruned framework throws to the metre and how long they grow in a UK summer; the stiffness of a green shoot and how far one holds itself out before it bends over; the sex of the plant supplied and whether it fruits; panicle length and flower count; UK dates of budburst, colour and leaf fall. Internode length and the thickening of young plants are now measured (Gifu Prefecture 2003), but on plants in Japan.

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

- Gifu Prefectural Research Institute for Agricultural Technology in Hilly and Mountainous Areas (2003), raising V. coignetiae from hardwood cuttings (internodes, shoot length, trunk girth and cane thickness of young plants, measured): https://www.k-agri.rd.pref.gifu.lg.jp/hukyu/15_hukyu/15-1hukyu.pdf
- Gerrath, Posluszny and Dengler (2001), International Journal of Plant Sciences 162: 729-745 (distichous phyllotaxy in Vitis riparia): https://scholarworks.uni.edu/facpub/3594
- Hattermann and others (2022), Frontiers in Forests and Global Change 5: 836247 (reach of searcher shoots, the common vine among the tendril climbers): https://doi.org/10.3389/ffgc.2022.836247
- Photographs compared, all on Wikimedia Commons (looked at, not copied): "Patio Vitis coignetiae Capel Manor College Gardens Enfield London England 01.jpg", "1294-Vitis coignetiae-BZ Brno-8.12.jpg", "Vitis coignetiae (leaf).jpg", "Vitis coignetiae - Flickr - peganum.jpg" and "(1)" to "(4)", "Vitis coignetiae (fruits s1).jpg", "Vitis coignetiae cluster.jpeg", "Vitis coignetiae kz01.jpg" to "kz04.jpg"; of the common vine for want of this species: "Vitis vinifera inflorescence.jpg", "Vitis-vinifera-flowers vigne inflorescence détail 2015-06-13.JPG", "Vitis vinifera 'Boskoop Glory' Blauwe druif. 08-08-2025. (actm.) 01.jpg".

Seen only as search-engine excerpts, and so entered nowhere as published values: fassadengruen.de (annual shoot growth 2 to 5 m; more sun, richer red), a Yamagata University bulletin and a USDA germplasm record (berries to a cluster), the Korea Forest Service leaflet (panicle opposite a leaf), the Kyoto Red Data Book (leaf five-angled).

**Status:** morphology and growth model written from published descriptions, with internodes and the thickening of young plants measured on the species in Japan (Gifu Prefecture 2003); the look compared with photographs of the plant on Commons (no photograph of it in flower was found). Nothing measured on a UK plant. Site fit must be reviewed.
