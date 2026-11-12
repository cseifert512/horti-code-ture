# Hedera helix

**Common name:** Common ivy  
**Place in palette:** OPTION WITH RESTRICTIONS — winter foliage and biodiversity

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Evergreen woody climber in two phases: juvenile shoots that climb and cling, with lobed leaves; and, after about ten years and in the light, adult shoots that stand free, bushy and unlobed-leaved, and carry the flowers and fruit. |
| Climbing or support mechanism | Self-clinging via adventitious aerial roots; does not have grape tendrils. |
| RHS ultimate-height envelope | RHS: 8–12 m; 10–20 years to ultimate size category. |
| Hardiness | H5 (RHS); winter cover still varies with site. |
| Flower / leaf / fruit season | Year-round foliage, each leaf living 3–4 years; nectar-rich flowers on adult shoots from September to November (RHS), late August to November (Metcalfe); green berries through the winter, ripening black mostly in March and April and taken by birds until June (Metcalfe, after Snow and Snow). |
| Aspect and exposure | Shade to sun; tolerates exposed/sheltered settings but contact/substrate matter. See "Light, aspect and shelter". |
| Soil | Broad tolerance, fertile well-drained preferred. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. The growth model's rates of extension, branching and thickening are provisional assumptions chosen to fall inside those descriptors; none is a measurement.

## Species-specific biological logic

Ivy shifts from juvenile climbing shoots to adult flowering shoots, and the two are different plants to look at. The growth model keeps them apart: climbing stems carry the lobed leaf and the rootlets and never flower; the adult phase is the model's "flowering side shoots", which carry the unlobed leaf, no rootlets, and one inflorescence each at the tip.

What governs the change is the growth phase, not the age of the wood: adult growth comes after about ten years (RHS; Metcalfe, citing Clark 1983), "mostly after the plant reaches the top of its support" (Bean), on "well-lit, aerial" shoots (Metcalfe); low light and warmth can turn it back (Metcalfe). The engine can time side shoots only by the age of the wood that bears them, so the model's adult shoots appear on the oldest wood first, which is the lowest, and not at the top in the light. See "Form: what the model draws".

## Form: what the model draws

Every count and size below is in [`morphology.json`](morphology.json) with its source; most are from Metcalfe (2005), the Biological Flora of the British Isles account.

**The climbing plant.** Slender stems lie on the timber, several side by side, light green at first and turning light brown, finely ridged with age; a main stem of a twelve-year-old plant is about 3 cm thick. On the side that touches the timber each internode has a cluster of rootlets: unbranched, 1 to 15 mm long, about 38 to a cluster, pale when new and brown within a year or two. The leaves stand singly at the nodes, alternately to left and right. Each is a leathery, shining, dark green blade 4 to 10 cm long and about as wide, heart-shaped at the base, with three or five triangular lobes and a pale vein running from the stalk to the tip of each lobe; it hangs from the end of a stalk 2 to 7 cm long with its upper side turned outwards. Four leaves are drawn: the ordinary five-lobed one, one with a longer end lobe, one with three lobes, and one so shallowly lobed that it is nearly a five-cornered shield. A new leaf is a lighter, yellower green while it unfolds.

**The adult shoots.** From about the tenth year the older stems throw stiff shoots 15 to 35 cm long that stand out from the support and turn upwards. Their leaves are unlobed: ovate to diamond-shaped, wedge-shaped at the base, drawn out to a point, wavy at the edge, with a pale midrib. Each shoot ends, in most years, in the inflorescence: a panicle of three to five globose umbels, the end one of about twenty flowers and the lower ones of fewer, 7 to 11 cm across in all. A flower is a top-shaped ovary capped by the domed nectar disc and the short style, with five yellowish-green petals 3 to 4 mm long that spread and bend back, and five stamens with bright yellow anthers standing between them. The end umbel opens first and the others in turn towards the leaves; the petals and stamens then fall and leave the ovaries.

**The fruit.** One umbel of a panicle sets, usually the end one. Its berries, 6 to 8 mm across, each with the flat scar of the disc and the point of the style on top, are green from November, turn dull blue-black between January and April, and have gone, eaten by birds, by the middle of June.

**Through the year, as a run shows it.** In leaf in every month. New leaves from mid March to the end of October, most of them in April and May. Flower buds at the ends of adult shoots from mid August; flowers open from the first days of September to the end of November, most in October; green berries from October, ripe ones from February to June; no fruit from mid June until the next flowers have gone over.

**Where the model simplifies, and where the engine cannot yet follow the plant.**

- *Where the adult shoots are.* The engine throws a side shoot from wood of a given age (here five years), at any height above 0.4 m. A real ivy makes adult growth where it has run out of support and stands in the light. On the specimen frame the top is reached in the fifth season, so the top bears adult shoots from the tenth, but lower, older wood bears them from the seventh: a few years too early and in the wrong place.
- *The foot of the plant.* The same 0.4 m that keeps flowers off the ground also keeps the short leafy shoots off it, so the lowest stems of an old plant are bare. Old ivy is bare-stemmed at the foot, but for another reason.
- *Adult shoots do not grow on.* A real adult shoot lengthens and branches each year into a bush that can stand a metre off its support; the model's stays the length it made in its first season and is shed after six.
- *The leaves of adult shoots* are set alternately to left and right; on the plant they spiral round the shoot. They share one range of leaf length and one spacing with the climbing leaves, so the smallest are drawn smaller than the 6 cm the source gives and the shoots are less crowded with leaves than real ones.
- *Short leafy shoots.* The leaves that clothe an old stem are carried in the model on short "spurs", which ivy does not have. They stand for the small leafy side shoots of a mat of ivy; how many there are, and how many leaves each carries, was chosen so that a lath with three stems on it bears about 200 leaves a metre. No count was found.
- *Colour.* The underside of a leaf is paler than the upper side, and leaves flush red or purple in cold weather and green again in spring (Metcalfe). Neither can be drawn: a leaf has one colour for both faces, and an evergreen leaf is given no winter state.
- *Leaf fall.* The model drops a leaf at the end of its fourth calendar year. Ivy sheds mainly in late spring.
- *The rootlets* of a cluster stand in two rows along the stem. A drawn cluster is not told which way its stem runs, so its roots spread all round and the stem hides those that lie along it.
- *From flower to fruit.* When a panicle has gone over it is removed and the fruiting umbel grows from nothing in its place, stalks and all, over two to three months. On the plant the stalks are there from flowering and only the berries swell.
- *Free climbing shoots.* A climbing shoot that finds no hold is slender and limp: it hangs or trails. The engine stands such shoots out into the air; see the note under "Parameters to obtain or calibrate".

## Light, aspect and shelter

- **Light classes accepted.** Full sun, partial shade and full shade (RHS plant record). As the RHS defines them: full sun is more than six hours of direct sun a day at midsummer, partial shade three to six, and deep shade less than two. The RHS ivy guide: ivies are "remarkably shade tolerant" but also grow well in full sun.
- **Aspect.** South, north, west or east: any (RHS plant record), exposed or sheltered. No aspect is recommended. Where a source prefers one condition it is shelter and soil, not light: the RHS record gives best growth in fertile, humus-rich, well-drained alkaline soil in a sheltered place.
- **What shade does to growth.** It favours the climbing phase. Ivy "grows most vigorously in shaded, moist sites"; it is classed as a semi-shade plant of 5 to 10% relative light and persists at about 3% of full sunlight; juvenile leaves are shade leaves and adult leaves sun leaves (all Metcalfe 2005). Under trees it takes 30 to 40 years to reach a canopy (Schnitzler and Heuzé 2006, cited by the US Forest Service review).
- **What shade does to flowering.** It prevents it. "Flowers are produced on well-lit, aerial, adult shoots"; "well-lit conditions are necessary for reproductive success"; ivy "flowers in brightly lit or lightly shaded sites"; a healthy tree's canopy is thick enough to suppress the fertile shoots; and adult growth may revert to juvenile "in low light and high temperatures" (all Metcalfe 2005). For a Bower: ivy on a shaded face gives leaves and no autumn flowers or winter berries; those come only where its upper growth stands in the light.
- **What too much sun or exposure does.** Leaves that are suddenly exposed to more light, as when a deciduous canopy over them drops its leaves, are photoinhibited and may photosynthesise less all winter, recovering in spring (Oberhuber and Bauer 1991, in Metcalfe). Ivy "tends to be limited to sheltered sites" on higher ground, where it has fewer, smaller and later fruit; late flowers are killed by frost and early fruit withers in hard cold (Metcalfe). In colder climates than Britain's, foliage burns and drops after severe winters or in exposed, windswept places (University of Connecticut plant database). It is very sensitive to salt (Bannister 1976, in Metcalfe). Leaves in the cold flush red to purple; that is a response and not damage.

Not found: any statement of how much less ivy grows in full sun than in shade in British conditions, or a light level below which adult shoots stop forming.

## What Bower must provide: local supports

Clings to the timber unaided. Keep its roots and stems out of timber gaps, joints and drainage details, where they thicken and can force members apart (RHS). It does not hold a steel cable: there it must be tied in.

## Global structure placement logic

Only clearly bounded winter-green patches.

## Gardener intervention / pruning

Explicit boundaries, periodic cutting/removal of encroachment, exposure of all timber junctions for inspection.

RHS pruning group 11, at any time. The RHS ivy guide trims excess growth in mid-spring and hard prunes an overgrown plant in early spring; check for nesting birds first (March to August). Ivy flowers only on bushy adult shoots, at the tips of that year's growth (provisional: inferred from Bean and the RHS). Adult growth appears after about ten years, and regular pruning keeps the plant juvenile and non-flowering, so the trimming regime decides whether there are flowers and berries at all.

## Interactions with the broader palette

Can overwhelm and shade nearby climbers; wildlife benefits must be balanced against engineering/maintenance risk. Its flowers fill the autumn gap of the reference palette (September to November) and its berries the late-winter one, but only from about the tenth year and only in the light.

## Risks, exclusions and scientific caveats

RHS warns ivy stems can enter wooden fence gaps, thicken and force timber apart; concentrated adult growth can add weight; invasive in some non-UK regions; harmful if eaten/skin irritant.

## Parameters to obtain or calibrate

Spread/attachment on selected textures, self-clinging pressure and stem thickening, juvenile/adult stage transition, yearly inspection time, leaf-retention in shade.

Measurements that would replace the model's assumptions, in order of what they would change most:

- yearly extension of a climbing shoot on timber, in sun and in shade, from planting (the model assumes 0.8 m a season after three slower years);
- where and when adult shoots first appear on a plant of known age and support, and how far the adult head stands out after five and ten years;
- leaves per metre of established stem, or leaf area per square metre of covered lattice (the model's cover is chosen, not counted);
- girth of the main stem at known ages;
- the length of the flower stalks and the width of the panicle and of the fruiting umbel (not in any source read);
- how far a climbing shoot that has lost its hold reaches before it hangs. No measurement was found. The descriptions are qualitative: the juvenile shoot is slender and creeps or trails (Stein and Fosket 1969: plagiotropic, as tabulated by the US Forest Service review); the adult shoot is orthotropic and stands by itself (the same table; RHS: "bushy, non-clinging branches"). Ivy wood is light and soft, about 530 kg per cubic metre (Metcalfe).

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json), [`model.json`](model.json) and [`morphology.json`](morphology.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/43091/hedera-helix/details
- Additional source: https://www.rhs.org.uk/prevention-protection/ivy-on-buildings
- RHS ivy guide: https://www.rhs.org.uk/plants/ivy/growing-guide
- RHS, levels of shade: https://www.rhs.org.uk/garden-design/shade-gardening
- Trees and Shrubs Online (Bean): https://www.treesandshrubsonline.org/articles/hedera/hedera-helix/
- Metcalfe, D. J. (2005). Biological Flora of the British Isles: *Hedera helix* L. Journal of Ecology 93: 632–648. https://doi.org/10.1111/j.1365-2745.2005.01021.x
- Melzer, B. et al. (2010). The attachment strategy of English ivy. J. R. Soc. Interface 7: 1383–1389. https://pmc.ncbi.nlm.nih.gov/articles/PMC2894893
- Melzer, B. et al. (2012). Structure, attachment properties, and ecological importance of the attachment system of English ivy. J. Exp. Bot. 63: 191–201. https://academic.oup.com/jxb/article/63/1/191/552796
- Konarska, A. (2014). Characteristics of flower nectaries of *Hedera helix* L. Acta Sci. Pol. Hortorum Cultus 13. https://czasopisma.up.lublin.pl/asphc/article/view/2741
- US Forest Service, Fire Effects Information System, *Hedera helix*: https://www.fs.usda.gov/database/feis/plants/vine/hedhel/all.html
- VicFlora (Flora of Victoria), *Hedera helix*: https://vicflora.rbg.vic.gov.au/flora/taxon/c4a3febc-0516-4d68-83ff-3712dd984839
- Virginia Tech dendrology factsheet: https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=464
- University of Connecticut plant database: https://plantdatabase.uconn.edu/detail.php?pid=202
- An online flora of Crete, *Hedera helix* subsp. *helix* (the width of the umbel only): https://cretanflora.com/hedera_helix_helix_text.html

**Status:** form and seasons taken from published descriptions; growth rates provisional and uncalibrated; site fit must be reviewed.
