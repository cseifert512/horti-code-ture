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

What governs the change is the growth phase, not the age of the wood: adult growth comes after about ten years (RHS; Metcalfe, citing Clark 1983), "mostly after the plant reaches the top of its support" (Bean), on "well-lit, aerial" shoots (Metcalfe); "Adult English ivy flowers in bright light" (US Forest Service review); low light and warmth can turn it back (Metcalfe). The engine can time side shoots only by the age of the wood that bears them and keep them above one fixed height, so the model's adult shoots appear on the oldest wood first, which is the lowest, and not at the top in the light. See "Form: what the model draws".

Ivy has no spurs. Its leaves stand singly along long shoots (Metcalfe: "alternate"); what keeps an old ivy clothed is a continual supply of new juvenile shoots that branch from the stems, lean out, sag, trail and root where they touch. The model gives these as free shoots of the year ("whips"), which the engine bends under their own weight and lets take hold of timber they come down on.

## Form: what the model draws

Every count and size below is in [`morphology.json`](morphology.json) with its source; most are from Metcalfe (2005), the Biological Flora of the British Isles account.

**The climbing plant.** Slender stems lie on the timber, several side by side, light green at first and turning light brown, finely ridged with age; a main stem of a twelve-year-old plant is about 3 cm thick. On the side that touches the timber each internode has a cluster of rootlets: unbranched, 1 to 15 mm long, about 38 to a cluster, a dense cream brush in two rows when new and brown and withered within a few years. The leaves stand singly at the nodes, alternately to left and right. Each is a leathery, shining, dark green blade 4.5 to 10.5 cm long and about as wide, heart-shaped at the base, with three or five triangular lobes and a pale vein, green rather than white, running from the stalk towards the tip of each lobe and fading as it goes; it hangs from the end of a stalk with its upper side turned outwards. Four leaves are drawn: the ordinary five-lobed one, one with a longer end lobe, one with three lobes, and one so shallowly lobed that it is nearly a five-cornered shield. A new leaf is a lighter, yellower green while it unfolds. From the fourth or fifth year many short juvenile shoots of the year stand off the stems, lean out a few tenths of a metre, bow under their leaves and hang; where one comes down on a lath it roots and runs on.

**The adult shoots.** From about the tenth year the older stems throw stout shoots, 5 mm at the foot, that set out at 50 to 80 degrees from their stem, turned towards up and the light, placed round it in a 2/5 spiral. They make 12 to 30 cm in their first season and 15 to 30 cm more each year after, up to 0.9 m, so that the adult growth thickens into a bushy layer over the frame. Their leaves are their own: unlobed, 6 to 10 cm, ovate to diamond-shaped, some broad and nearly rounded and some narrow with a drawn-out tip, wedge-shaped at the base, wavy at the edge, with a pale midrib, crowded, very glossy, held flatter than the climbing leaves, each living four years so that an old adult shoot is leafy towards its end. Each shoot ends, in most years, in the inflorescence: a panicle of three to five globose umbels, the end one of about twenty flowers and the lower ones of fewer, 7 to 11 cm across in all. An umbel is a tight ball about 3.5 cm across, flowers on every side but underneath. A flower is a top-shaped ovary about 3 mm across capped by the domed nectar disc and the short style, with five yellowish-green petals 3 to 4 mm long that spread and bend back, and five stamens with bright yellow anthers bristling out between them. In bud it is a tight pale knob. The end umbel opens first and the others in turn towards the leaves; the petals and stamens then fall and leave the ovaries.

**The fruit.** One umbel of a panicle sets, usually the end one. It is a tight ball 2.5 to 3.5 cm across of 12 to 22 berries, 6 to 8 mm each, crowded and touching on short stalks, each with the flat scar of the disc and the point of the style on top. They are dull green from November, pass through a dull purple and turn blue-black between January and April, and have gone, eaten by birds, by the middle of June.

**Through the year, as a run shows it.** In leaf in every month. New leaves from mid March to the end of October, most of them in April and May. Flower buds at the ends of adult shoots from mid August; flowers open from the first days of September to the end of November, most in October; green berries from October, ripe ones from February to June; no fruit from mid June until the next flowers have gone over.

**Where the model simplifies, and where the engine cannot yet follow the plant.**

- *Where the adult shoots are.* The engine throws a side shoot from wood of a given age (here five years), at any height above 0.3 m, and asks nothing of light. A real ivy makes adult growth where it has run out of support and stands in the light. On the specimen frame adult shoots stand from 0.3 m up, median 1.2 m: too low, and from the eighth season on lower, older wood rather than at the top. A height of 1.2 m was tried and left the lower half of the frame bare (the same height keeps free juvenile shoots off the stem), so it was not kept.
- *Flowering and light.* The engine scales flower buds by the light the plant receives for spurs and current-season flowers, but not for flowers at the ends of side shoots, which are ivy's only flowers. A shaded ivy in the model flowers as freely as one in sun.
- *Adult shoots do not fork.* A real adult shoot lengthens and branches each year into a bush; the model's lengthens by 15 to 30 cm a year to 0.9 m but stays a single wand, and does not die back.
- *The leaves of adult shoots* are set alternately to left and right; on the plant they spiral round the shoot (2/5). Their spacing cannot be drawn finer than the engine's 4 cm between stem points, so the shoots are less crowded with leaves than real ones.
- *Renewal of the cover.* The engine makes no new leaves on a stem whose route is full, and ivy's leaves live four years, so the framework's own leaves are gone by the eighth year. Free juvenile shoots carry the cover after that (organs.whipShareOfNodes, 0.1). They are what a real ivy does too, but the share is chosen to make the frame look as closely covered as ivy on a fence, not counted, and a real plant also renews leafy shoots that lie flat on the timber.
- *Colour.* The underside of a leaf is paler than the upper side, and leaves flush red or purple in cold weather and green again in spring (Metcalfe). Neither can be drawn: the viewer shades a leaf's underside matt but gives it the same colour, and an evergreen leaf is given no winter state.
- *Leaf fall.* The model drops a leaf on 1 January after its fourth season, every such leaf on that one day. Ivy sheds mainly in late spring ("The main period of litterfall occurs in late spring", US Forest Service review). organs.winterLeafShare cannot mend this for a plant whose profile says evergreen: it spreads the shedding of kept leaves over the spring flush only for a semi-evergreen.
- *The rootlets* of a cluster stand in two rows along the stem. A drawn cluster is not told which way its stem runs; the rows are laid across the model's own up, which is right on a post and wrong on a level lath.
- *From flower to fruit.* When a panicle has gone over it is removed and the fruiting umbel grows from nothing in its place, stalks and all, over two to three months. On the plant the stalks are there from flowering and only the berries swell.
- *Free climbing shoots* are rods of 2.5 mm whose stiffness, weight and reach are chosen (Hattermann et al. 2022 give 0.14 to 0.91 m as the reach of tendril climbers and root climbers together, ivy being the only root climber; nothing opened gives ivy's own range or its stiffness). About two in five end lower than they started and half rise less than 11 cm before they bow; the rest stand a little. Laid points keep the shape they had when their wood set, so a shoot keeps more of an arch near its base than a limp one would.

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

## Care: what the gardener does

What the sources say:

- RHS pruning group 11, at any time (RHS plant record). The RHS ivy guide: "trim back any excess growth in mid-spring"; "Overgrown plants can be hard pruned in early spring: they regenerate readily from old wood"; "Regular pruning will maintain ivies in a self-clinging, non-flowering juvenile state"; for wildlife "it is best to allow adult growth to develop"; adult growth comes "after around 10 years". https://www.rhs.org.uk/plants/ivy/growing-guide
- RHS, ivy on buildings: trim growth away from gutters, windows, chimneys and roofs with secateurs or loppers, a task that "may need doing a few times per year, but once a year is often enough"; ivy "can damage wooden fences if stems grow into gaps between slats or panels", and annual pruning keeps it to one panel; nesting season "generally lasts from March to August", so check before any work; remove heavy branching growth where its weight is a risk. https://www.rhs.org.uk/prevention-protection/ivy-on-buildings
- Flowers open September to November and the berries ripen from late winter into spring (RHS; Metcalfe), so any cut between September and April takes the season's flowers or berries off the shoots it shortens.

The routine taken for a Bower, which keeps the flowers and berries the palette wants ivy for:

1. **Late February, once a year, before nesting begins.** Cut back every juvenile shoot that has grown beyond the bounds set for the plant, and pull and cut out any stem that has entered a joint, gap, drainage detail or the face of a junction to be inspected, back to where it lies on open timber. Cut free-hanging juvenile shoots back to the face of the timber where they block a path or window. Leave the adult (bushy, unlobed-leaved) growth, which then carries ripening berries for the birds through March and April.
2. **Late August or early September, every second or third year, after nesting and before the flowers open.** Shorten the adult growth where it stands out further from the timber than the design allows (for example 0.5 m) or has grown too heavy, cutting each bushy shoot back to a fork within the line. This takes some of that autumn's flowers, which is the price of keeping the head in bounds.
3. **Every winter visit:** inspect the junctions the ivy is kept off.

A tied-in young plant needs no tying after its first season: it clings by itself. Hard renovation (all growth to 0.3-0.5 m in early spring) is for a plant that has outgrown its place; it regrows from old wood and goes back to juvenile growth for some years.

What the model would need to act on this. Today "trained" for ivy means the engine ties in the young stems and nothing more; none of these visits is modelled. It would need (a) a dated "trim to bounds" event that removes, lineage and all, every stretch of stem and every free shoot outside an envelope declared for the plant or inside a declared exclusion (joints, junction faces), on a date, with what goes recorded; (b) the climbing rose's `shorten_side_shoots` (which exists) applied to ivy's side shoots, on a date late in August, every second or third year, keeping a share of each adult shoot's length, or better cutting back to a fork, which the engine cannot express while side shoots do not fork; (c) a rule that nothing is cut from March to August (nesting). None of `MODELLED_ROUTINE`, `sim/scenarios.ts` or `sim/planting.ts` was edited.

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
- the diameter and bending stiffness of a juvenile shoot of the year, and the fresh mass of its leaves per area: these decide whether a free shoot stands or hangs. Hattermann et al. 2022 measured ten ivy searchers (reach 0.14 to 0.91 m for tendril climbers and root climbers together, the root climbers being ivy alone, with no range for ivy by itself; ivy had the least mechanical tissue of 29 climbers, 18% of the section) but the per-species stiffness was not in the text that could be read. The juvenile shoot is slender and creeps or trails (Stein and Fosket 1969: plagiotropic, as tabulated by the US Forest Service review); the adult shoot is orthotropic and stands by itself (the same table; RHS: "bushy, non-clinging branches"). Ivy wood is light and soft, about 530 kg per cubic metre (Metcalfe);
- how many adult shoots a metre of old stem carries, and how fast they lengthen in Britain (the model's 15 to 30 cm a year rests on a search summary of an American clone, 'Treetop', which could not be opened).

## Second pass: compared with photographs

Twenty-four photographs from Wikimedia Commons were looked at beside the stills (file names are given in the bases in `morphology.json` and `model.json` where a reading was taken from one). What they changed: the cover is now a curtain of leaves with shoots hanging from it rather than a garland on each lath; ivy has no spurs; adult shoots grow on into a bushy head with their own larger, glossier, more varied leaves; umbels are tight balls of flowers with bristling stamens instead of a sparse firework; berries crowd into a tight ball and pass through dull purple; rootlets are a fine brush; the climbing leaf lost a pattern of concentric arcs that came from laying a pinnate vein texture round a fan of lobes, and its veins are pale green and fade towards the tips. One photograph filed on Commons as ivy on a house (2015 05 14 001 Wohnhaus mit Efeu bewachsen.jpg) shows matt, lime-green, three-lobed leaves that look like Boston ivy (*Parthenocissus tricuspidata*); it was not used.

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
- Hattermann, T. et al. (2022). Mind the gap: reach and mechanical diversity of searcher shoots in climbing plants. Frontiers in Forests and Global Change 5: 836247. https://doi.org/10.3389/ffgc.2022.836247

**Status:** form and seasons taken from published descriptions; growth rates provisional and uncalibrated; site fit must be reviewed.
