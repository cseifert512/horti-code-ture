# Rosa 'The Generous Gardener'

**Common name:** Climbing rose (Ausdrawn)  
**Accepted name:** RHS: *Rosa* The Generous Gardener ('Ausdrawn') (Cl). 'The Generous Gardener' is a trade designation; the cultivar epithet is 'Ausdrawn'. Bred by David Austin, introduced 2002; 'Sharifa Asma' x an undisclosed parent (HelpMeFind).  
**Place in palette:** CORE OPTION — low/middle fragrance and pink repeated bloom

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Woody climbing rose with strong, arching, prickly canes; deciduous. Grown untied it makes a rounded shrub about 1.5 to 1.75 m high. |
| Climbing or support mechanism | Scrambling canes; requires human tie-in/training — not a botanical twiner. |
| Height and spread | Breeder: 15 ft (4.5 m) as a climber, the height of a three-year-old plant pruned once a year. RHS: "up to 4.5m" (size category 4–8 m), spread 2.5–4 m, 5–10 years to ultimate size. |
| Hardiness | H6 (RHS). |
| Leaf | Alternate, odd-pinnate, glossy dark green, hairless, the leaflets ovate and serrate (NC State); "large" (HelpMeFind); young growth burgundy (one grower). |
| Flower | Pale pink, a soft glowing pink at the centre shading to palest pink on the outer petals; cupped, opening to show "numerous stamens", "an almost water lily-like effect"; nodding; 5–9 cm across (breeder's "medium"); 40–50 petals (NC State; 41 HelpMeFind); singly or in small clusters; strong scent of Old Rose, musk and myrrh. |
| Flowering season | Repeat flowering: a main flush in June, then lesser flushes into October or November (breeder: "from late spring to early winter"; RHS: "from midsummer to autumn"). |
| Fruit | Orange hips in autumn where the spent flowers are left, "rather fat", still on the plant in late December. |
| Aspect and exposure | Full sun or partial shade; any aspect, north-facing included; exposed or sheltered (RHS). |
| Soil | Moist but well-drained fertile soil. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. Nothing in this file is a measurement of a plant of this cultivar: the numbers the simulator uses are in [`model.json`](model.json) and [`morphology.json`](morphology.json), each with its evidence status.

## Species-specific biological logic

Perennial canes with seasonally produced flowering laterals; different flowering and renewal dynamics from wisteria. A rose flowers at the end of a leafy shoot of the year. On a climbing rose those shoots are side shoots from canes made in earlier years, which is why the gardener keeps the framework and shortens the flowered side shoots each winter. After a spray has gone over, buds below it break and flower in their turn five or six weeks later: that is the repeat. If the spent flowers are left, hips form and the plant makes fewer new flowers.

## Form: what the model draws

**Canes.** Two canes on the plant as it arrives and a new one from the base in most of the next seasons, six in all. Each grows about 2 m a season once established and stops at 3.4 to 4.6 m; the gardener ties it along the lattice, and at crossings it later throws branch canes of 1 to 2 m. A new shoot is red and is green within weeks; a cane stays smooth and green for two or three years and is grey-brown bark by its sixth. Every stem carries hooked prickles 4 to 8 mm long, broad-based, red when young and dull tan on old wood.

**Side shoots and leaves.** Early each March about half the buds along every cane a year or more old, above 0.4 m from the ground, break into a side shoot 0.2 to 0.6 m long. It carries a leaf every 4 cm: 11 to 17 cm long, of five or seven ovate, toothed leaflets in pairs with a larger end leaflet (three leaflets on the shortest leaves), and a pair of stipules joined to the foot of the stalk. Leaves unfold burgundy and turn a polished dark green. They yellow a little in November and are down by Christmas.

**Flowers.** From the first week of June to the third week of October three side shoots in four end in a spray, held on the line of the shoot: one to three flowers that open and a bud or two that stay shut. A flower is a cup of forty-five petals in six rows, 6 to 8 cm across, palest pink at the rim and a warmer pink in the heart, opening round a ring of golden stamens; each nods on its own stalk. The end flower opens first. A spray is in flower for two to four weeks; when the petals have dropped the calyx and stamens stand a few days longer.

**Hips.** About a third of sprays leave hips, one for each flower that opened: round and rather fat, about 2 cm, green, colouring orange between September and the end of November, each crowned with its dried sepals. They hang on the bare plant through the winter and go between late January and early March.

**Winter.** Bare green canes and side shoots, red-prickled, with orange hips at the ends of the shoots. The side shoots of the year are shed when growth starts again.

**Where the model simplifies the plant.**

- Repeat flowering is shown as a steady succession from June to October, not as a June flush followed by lesser ones: the engine opens one spray on each side shoot on a day drawn evenly from one window. In June there are fewer flowers than a real first flush and in September more.
- Every side shoot breaks at budburst and has made its length by early June. In life the later flowers are borne on new shoots that break below the spent ones.
- One leaf size and one leaf spacing serve both the long canes and the short flowering shoots, and the engine sets leaves no closer than its 4 cm step: a flowering shoot has fewer leaves than the ten to sixteen of a measured garden rose, and a cane more than it should.
- No long free shoots are thrown and nothing is pruned: the engine has no routine for a climbing rose (RHS pruning group 17). An old cane is never taken out, and a flowered side shoot is shed whole where a gardener would cut it back by two thirds.
- A side shoot is a straight, stiff rod. In life it arches towards the light and bows under its flowers.
- Left untied, the plant does not grow at all in the engine. In life it makes an arching shrub (see "Free shoots" below).
- Hips ripen by the calendar, not by their age, so the hips of the last flowers stay green until they go; and one share of sprays sets hips all season, where a gardener deadheads until midsummer and then stops.
- Leaves stand alternately to left and right of a shoot, not in the spiral of a rose.
- Autumn colour is not recorded for the cultivar; the slight yellowing drawn is a choice. In a mild winter some leaves hang on, which is not shown.
- A flower has one pose: it does not go from cup to open saucer, and the bud of a flower about to open is the whole corolla drawn small. Prickles are equally dense on every stem, and their shape is that of another climbing rose.

## Light, aspect and shelter

- **Light classes accepted:** full sun and partial shade, not full shade. RHS plant record: sunlight "Full sun, Partial shade". Breeder: "Full sun and partial shade", and "partial shade" among the places it suits.
- **How much light:** the RHS rose guide says roses "love sun, although some will cope in light shade" and asks for "at least four hours of sunlight a day". David Austin says the same of English Roses ("at least four hours of sunlight each day"), that "Few roses will prosper in deep shadow", and of this rose that it "is beautifully at home in less direct light".
- **Aspect:** any. RHS: north-, south-, east- or west-facing. Breeder: north, east, south and west facing. Provender Nurseries: "will grow well on a north-facing wall". No source asks for an aspect for warmth or for shelter: the plant is hardy to H6 (-20 to -15 degC), and the north wall is offered as a place it tolerates for want of light, not as a refuge.
- **Exposure:** RHS plant record: "Exposed or Sheltered". The RHS rose guide advises against "very exposed, windy sites" for roses at large, and has the long whippy shoots of a climber tied in or shortened in autumn so that winter wind does not rock them.
- **What shade does:** flowers in shade last longer and keep "their freshness and depth" of colour, and pinks look cooler (David Austin). Less light means fewer flowers: one grower with the plant at the foot of a pergola in four to six hours of sun reports about ten blooms in the first flush, twenty in the year, and "hardly any leaves until you get to the top of the plant" (HelpMeFind comments; one account, not a measurement). The taxon file's "flowers best where light reaches the cane framework" stands. No source read says what shade does to the length of the canes.
- **What too much sun or exposure does:** the breeder notes that colour "may vary" with growing conditions and that fading occurs; BBC Gardeners' World Magazine describes the flowers as "soft pink to pale white-pink", and a grower describes them as lighter or warmer with light and weather. The RHS lists powdery mildews, black spot, rust and flower balling among its problems; one nursery is reported to advise against a hot south or west wall for fear of mildew, but that page could not be read and the advice is not relied on here.

## Free shoots: how the canes and side shoots really behave

- **Canes.** The breeder describes "strong, elegantly arching growth". A cane stands by itself for its first metre and a half or so and then arches over: grown without a support the plant is "an excellent rounded shrub" 1.75 m high and 1.5 m across (Provender Nurseries), 1.5 m high by 1.2 m (HelpMeFind's lower figure), 2.5 m by 1.5 m (BBC Gardeners' World Magazine). A cane of 3 to 4.5 m therefore carries its tip out about 0.6 to 0.75 m from the base and down again. Roses are "semi-selfsupporting" hook climbers: their stems become mechanically unstable past a certain length and then lean on what is near, catching by their prickles (Gallenmueller and others 2015). Across 29 climbing species the unsupported searcher shoots of hook climbers reached 0.7 to 2.7 m, and a reach beyond about 0.8 m needed a structural Young's modulus of about 3000 MN/m2 (Hattermann and others 2022; no rose was measured). No measurement of the stiffness or density of this cultivar's canes was found.
- **Side shoots.** 0.2 to 0.6 m, stiff enough to hold their line, growing out and up towards the light; the weight of the flowers bows the last few centimetres, which is the nod the breeder describes. They are too short to hang.
- **In the model.** Canes exist only where the gardener ties them. Side shoots stand out from their cane as straight rods, those along one member nearly parallel.

## What Bower must provide: local supports

Strong and reachable tie points, training directions that can encourage lateral flowering shoots, and comfortable distance from people due to thorns. The RHS spaces training wires 30 cm apart, the lowest 45 cm from the ground, and trains the main shoots "as horizontal as possible" so that they flower low down. Side shoots stand 0.2 to 0.6 m out from the canes.

## Global structure placement logic

3–5 m human-facing arch/entry sector rather than overhead 12 m crown.

## Gardener intervention / pruning

Explicit gardener tie-in, pruning, renewal of old canes and possible deadheading; inspect thorn/public interface.

RHS pruning group 17 (climbing roses). Prune between December and February: remove dead or diseased wood, tie in the new shoots needed, cut flowered side shoots back by two thirds, and take out an old cane at the base where congested; in renovation keep no more than six young, vigorous stems. In autumn tie in or shorten long whippy shoots before winter winds. Deadhead through the flowering season, and stop in midsummer where hips are wanted. Feed in March or April and again in midsummer. Climbing roses flower on the current year's growth (BBC Gardeners' World Magazine, of climbing roses as a class), on side shoots from the tied-in framework.

## Interactions with the broader palette

Adds summer pink/pale bloom complementing purple wisteria/clematis; give independent maintenance route. Orange hips on bare green canes are its winter contribution where the last flowers are left.

## Risks, exclusions and scientific caveats

Thorns and falling flowers near public circulation; **no self-climb** without gardener-created ties. Sources disagree about how armed the cultivar is: NC State calls it "nearly prickle-free" and a US nursery lists it as nearly thornless, while growers call it thorny. The cautious reading is kept: armed.

## Parameters to obtain or calibrate

On a plant of this cultivar, by age: length a cane adds in a season; how many buds along a tied cane break, by the angle of the cane; length and leaf count of a flowering side shoot; flowers and buds to a spray; days from one flush to the next and the share of shoots that flower again; prickles per metre of cane and of side shoot, and their size; leaf and leaflet length; size of a hip, share of undeadheaded flowers that set one, and the dates on which hips colour and go; dates of budburst and leaf fall; cane diameter by age.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json), [`model.json`](model.json) and [`morphology.json`](morphology.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/196207/rosa-the-generous-gardener-ausdrawn-cl/details
- RHS pruning climbing roses: https://www.rhs.org.uk/plants/roses/climbing/pruning-guide
- RHS rose guide: https://www.rhs.org.uk/plants/roses/growing-guide
- The breeder, David Austin Roses: https://www.davidaustinroses.co.uk/products/the-generous-gardener-climbing-rose ; its description as a retailer reprints it: https://www.gardenista.com/products/the-generous-gardener-climbing/ ; on shade: https://eu.davidaustinroses.com/blogs/news/shady-areas ; on the June flush: https://eu.davidaustinroses.com/blogs/news/what-the-longest-day-reveals-about-roses
- NC State Extension plant record: https://plants.ces.ncsu.edu/plants/rosa-the-generous-gardener-ausdrawn/
- HelpMeFind: https://www.helpmefind.com/rose/l.php?l=2.37005 ; growers' comments: https://www.helpmefind.com/gardening/l.php?l=2.37005&tab=32
- Provender Nurseries factsheet (hips, north wall, size as a shrub): https://www.provendernurseries.co.uk/factsheets/rosa-the-generous-gardener-ausdrawn
- BBC Gardeners' World Magazine: https://www.gardenersworld.com/plants/rosa-the-generous-gardener/ ; climbers and ramblers: https://www.gardenersworld.com/plants/the-difference-between-climbing-and-rambling-roses/
- Repeat-flowering roses, flushes and their spacing: https://www.crocus.co.uk/features/_/articleid.1321/
- A gardener's hips in December: https://teddingtongardener.com/2013/12/22 ; a grower on thorns and new growth: https://www.houzz.com/discussions/1577723/please-comment-on-austin-s-the-generous-gardener
- A measured garden rose of another cultivar, 'Radrazz' (internodes, leaflets, leaves to a shoot): Demotes-Mainard and others 2013, https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2013.00418/full
- Prickles of another climbing rose, Rosa arvensis 'Splendens', and roses as hook climbers: Gallenmueller and others 2015, https://pmc.ncbi.nlm.nih.gov/articles/PMC4667892/
- Reach and stiffness of unsupported shoots of climbers: Hattermann and others 2022, https://www.frontiersin.org/articles/10.3389/ffgc.2022.836247/full

Not read, though sought: the flora treatments of the genus (Flora of North America, Flora of China: both refused the request), on which the stipules and the five sepals rest; the breeder's American listing, which is reported to give 55 petals; and the breeder's list of roses for hips.

**Status:** researched from published descriptions in November 2026; a running growth model and organ models drawn from descriptions, none of it measured on a plant.
