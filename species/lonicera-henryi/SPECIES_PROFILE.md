# Lonicera henryi

**Common name:** Henry's honeysuckle  
**Accepted name:** RHS: *Lonicera henryi*. Kew's World Checklist treats it as a synonym of *Lonicera acuminata* Wall.; search invasive-species databases under both names.  
**Place in palette:** CORE — evergreen side canopy

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Evergreen woody twining climber (RHS); British field accounts call it winter-green or semi-deciduous (BSBI), so real winter leaf retention varies with exposure. |
| Climbing or support mechanism | Stem twining. No written source gives the handedness of this species. Two photographs of identified plants (Wikimedia Commons: Botanischer Garten Berlin-Dahlem, and a stem on a post) show a left-handed helix, clockwise seen from above, as in its congeners. Still a provisional assumption until a specimen is checked. |
| RHS ultimate-height envelope | RHS: 4–8 m; ultimate size generally 2–5 years under suitable cultivation. |
| Hardiness | H5 (RHS). |
| Flower / leaf / fruit season | Dark green foliage through winter; small yellow-red tubular flowers in summer (RHS), in June according to Bean; later dark berries. |
| Aspect and exposure | Full sun/partial shade; north/east/west possible; RHS accepts exposed or sheltered, though canopy persistence remains site-specific. |
| Soil | Fertile, moist, well-drained, humus-rich. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Species-specific biological logic

Lateral expansion and evergreen leaf cohorts should continue over winter, with normal leaf turnover and exposure-dependent stress.

## What Bower must provide: local supports

Continuous graspable thin/medium support network; provide pruning access and stable anchor points for woody twining stems.

## Global structure placement logic

Lower/middle perimeter and shaded side canopy, not presumed to grow across a 12m support path to the apex.

## Gardener intervention / pruning

Control competitive overgrowth, thin to preserve other plants, inspect attachments and berries in visitor spaces.

RHS pruning group 11 (vigorous climbers: no regular pruning, trimmed to fit the space); the RHS record gives no timing. Tidy in spring, removing congested or dead shoots and shortening long ones (Gardens Illustrated names this species; the RHS honeysuckle guide says the same of late-flowering types and warns that a hard prune reduces flowering). Mulch in spring. Flowering wood is provisionally the current season's growth: inferred from those two guides, not stated for this species by any source.

## Interactions with the broader palette

Good winter complement to deciduous wisteria; retain separate lanes from *Clematis cirrhosa* where possible.

## Risks, exclusions and scientific caveats

**Spreads.** In Britain it is a naturalised, bird-sown neophyte extending its range in woodland margins and hedgerows (BSBI), and it is on the EPPO Alert List as *L. acuminata*. It is not legally listed in Great Britain, but it must be kept contained and away from semi-natural habitat. Evergreen ≠ guaranteed lush coverage under all winter exposures; fruit ornamental, not for eating.

## Form: what the model draws

Every number behind this section is in [`morphology.json`](morphology.json) (shape) or [`model.json`](model.json) (growth), each with its evidence status. What follows is the plant in words, and where the model falls short of it.

**Habit.** A many-stemmed evergreen twiner. Slender stems wind up laths and cables, several to a support and round one another, and from them the plant makes two kinds of shoot each year: long shoots of 0.47 to 1.5 m (measured by Weber 2005 in a Swiss wood), and short leafy shoots of a few pairs of leaves that end in the flowers. Sources call it vigorous or fast, a plant that smothers what it is given (Rainyside) and lays a dense carpet over shrubs and ground (Info Flora). The RHS gives 4 to 8 m in 2 to 5 years; Info Flora, shoots to 10 m.

**Leaf.** In opposite pairs. A short hairy stalk (3 to 13 mm) and a leathery blade 44 to 102 mm long and 13 to 41 mm wide (Bean), oblong-lanceolate to oblong-ovate, rounded or slightly heart-shaped at the base and drawn out to a long point. Dark glossy green above with a pale impressed midrib and six to eight pairs of looping side veins, paler beneath, the margin fringed with fine hairs. New growth is flushed with bronze (Gardens Illustrated). The model draws three outlines, from the slender small leaf to the broad large one, each in two postures, with the vein relief and the fringe of hairs at close range.

**Flowers.** At the end of a short leafy shoot, in a cluster 2 to 3 in. across (Bean): two-flowered stalks in opposite pairs up a short axis, six to fourteen flowers in all (counted on photographs). Each flower is a curved tube 13 to 19 mm long opening into two lips rolled right back, the upper four-lobed and the lower a narrow strap, with five stamens and a longer style standing well out. Buds are greenish cream clubs flushed purplish red; open flowers are purplish red on the lips and yellow in the throat, and turn coppery yellow as they age (Flora of China: "becoming yellow tinged orange or purple"). They open from the lowest pair upwards, in June and July, with the last going over in early August. They are small and half hidden among the leaves: a plant in full flower is still a green plant.

**Fruit.** Each stalk's two flowers leave two ovoid berries 6 to 7 mm through, crowned by the calyx: glaucous grey-green and full size by the start of August, blue-black under a bloom from late August to October, hanging into early winter until birds take them.

**Wood.** The growing tip is green and bristly; within weeks the shoot is crimson to red-bronze, then pale brown. Old stems are light brown and shred in long papery strips, twisted round one another into ropes 25 to 40 mm through.

**Through the year.** Winter: in leaf, darker and thinner than in summer, with the last berries. March to May: new shoots and leaves, bronze at first; buds at the shoot tips from mid-May. June to early August: flowers, with green berries following the first of them. Late August to November: berries ripen blue-black; the long shoots of the year reach their length. December: berries go.

**Where the model simplifies.**

- *Leaf posture.* On the plant the leaves of a hanging shoot hang with their faces outward. The engine sets every leaf out to the side of its shoot and upward, and a leaf model must lie along that direction, so the leaves are drawn spreading and arching, not hanging. Seen level from a distance the plant therefore reads thinner than its leaf count.
- *Free shoots.* A long shoot that finds no hold does not stand in the air: it arches over within a few decimetres, hangs, winds round its neighbours or trails on the ground and roots (Info Flora). The engine grows such shoots out on a fixed curve and leaves them there, never hanging, twining on one another or rooting; they are also never trimmed, because the model has no pruning routine for this plant.
- *Short shoots.* A flowering shoot is drawn flowering again at its own tip in each of the three years the model keeps it. On the plant it flowers once at the tip and branches below it.
- *Flowers along the upper leaf axils* (Flora of China: "paired, axillary at branchlet tips") are gathered into the one cluster at the tip.
- *Buds.* The drawing program shows an unopened flower as a small copy of the open one. The club-shaped buds in the cluster are therefore separate parts that never open: they stand for the flowers still to come while the cluster is in flower, and go half way through its fall.
- *One leaf size and one colour on both faces of a leaf*: the paler underside (Bean) is not drawn, nor the yellowing of a leaf about to be shed, nor the hairs on stems and stalks.
- *Leaf life.* Every leaf is kept through the winter after it is made and the whole of the next year. Sources range from evergreen (RHS) to winter-green or semi-deciduous (BSBI); none gives the life of a leaf.
- *Dates* are fixed days placed inside the months sources give. None was observed on a British plant.

## Light, aspect and shelter

| Question | What the sources say |
|---|---|
| Light classes accepted | **Full sun or partial shade** (RHS record). The RHS cultivation note: "best in partial shade but tolerant of full sun". Full shade is not listed by the RHS, but Swiss sources call it shade-tolerant: it naturalises in shady woods and along shaded paths (Info Flora), the Thurgau leaflet calls it "schattentolerant", and Landolt's light value for it is 3 of 5 (Info Flora). German garden guides give partial shade to shade (gartenjournal.net) or sun to partial shade (NaturaDB). |
| What the recommended aspect is for | The RHS gives **east-, north- or west-facing**, and leaves out south. That is a matter of **light and heat, not of warmth or shelter**: the same record rates it H5 and accepts an exposed or a sheltered site. The RHS honeysuckle guide (for the genus) says a south wall's full sun encourages flowers but "the leaves may be scorched", and that honeysuckles are more prone to powdery mildew in hot dry weather; Gardens Illustrated wants the roots and base cool with the growth reaching into light, finds aphids worst in direct sun, and calls a west-facing wall ideal. |
| What shade does to growth | Little harm: Weber's current-year shoots of 0.47 to 1.5 m were measured in a wood, where the plant carpets the floor and climbs into the crowns. The evergreen leaf lengthens its season (Info Flora). |
| What shade does to flowering | Reduces it. RHS guide (genus): dappled shade gives the healthiest plant and best flowering, but "too much shade will result in an absence of flowers". NC State (as *L. acuminata*): more flowering in full sun in cooler regions. No figure for this species. |
| What too much sun or exposure does | Leaf scorch on a south wall (RHS guide, genus); leaf burn in full sun unless kept moist (NC State); powdery mildew where it is hot and dry at the root (RHS guide); lower stems going bare, the more so in sun, and frost damage on very sunny sites in winter (gartenjournal.net, which advises shading fleece there). In very hard winters some leaves fall and are replaced in spring (gartenjournal.net); British field accounts call the plant winter-green or semi-deciduous (BSBI). A retailer's note that leaf drop is worst in cold north or east winds and strong winter sun was reported by a search summary but could not be read, and is not relied on. |

What the model uses of this: the engine's light model reads the one sentence on aspect in `taxon.json` (full sun or partial shade; north, east or west facing) and slows growth where a plant has less light than that sentence accepts. The sentence does not tie flowering to light, so the model does not thin this plant's flowers in shade, though the RHS guide says shade does; and nothing in the model scorches a leaf in sun or drops one in cold wind. For a Bower it means the shaded side and the lower, sheltered parts suit the plant, that flowering should be expected to thin in deep shade, and that winter leaf on an exposed, sunny crown is the least certain part of its evergreen role.

## Parameters to obtain or calibrate

Winter retention by temperature/wind; extension and branching; leaf area and occlusion; amount of shading tolerated; tendency to entangle adjacent climbers.

Measurements that would settle what the growth model still assumes: the length of an internode on long and on flowering shoots; how many long and short shoots a metre of older stem throws in a year; the life of a leaf and of a short shoot, by exposure; the thickest support a stem will twine unaided; the direction of twining on a living specimen; dates of first growth, first and last flower and berry ripening in Britain; the share of clusters that set fruit; the diameter of young and of ten-year-old stems.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json) in this folder.
- RHS taxon profile: https://www.rhs.org.uk/plants/10471/lonicera-henryi/details
- RHS honeysuckle guide: https://www.rhs.org.uk/plants/honeysuckle/climbing/growing-guide
- RHS pruning groups 11 to 13: https://www.rhs.org.uk/plants/types/climbers/established-pruning-guide
- Trees and Shrubs Online (Bean): https://www.treesandshrubsonline.org/articles/lonicera/lonicera-henryi/
- Gardens Illustrated: https://www.gardensillustrated.com/plants/honeysuckle-lonicera-how-to-grow/
- Shape of its parts, each with its source: [`morphology.json`](morphology.json). Growth numbers: [`model.json`](model.json).
- Flora of China 19 (2011), as *Lonicera acuminata*, which there includes *L. henryi*; read from a mirror of the text: https://www.zhiwutong.com/latin/Caprifoliaceae/Lonicera-acuminata-Wall.htm
- Info Flora fact sheet (2020), *Lonicera henryi*: https://www.infoflora.ch/de/assets/content/documents/neophyten/inva_loni_hen_d.pdf and species page https://www.infoflora.ch/en/flora/lonicera-henryi.html
- Weber E. (2005) *Lonicera henryi* Hemsl., a potential exotic forest weed in Switzerland. Botanica Helvetica 115: 77-81 (abstract read; the full text was not): https://link.springer.com/article/10.1007/s00035-005-0710-2
- EPPO Alert List entry (as *L. acuminata*): https://gd.eppo.int/reporting/article-6673
- BSBI species account: https://bsbi.org/taxa/2cd4p9h.amg/lonicera-henryi
- Kwantlen Polytechnic University plant database (as *L. acuminata*): https://plantdatabase.kpu.ca/Plant/lohe
- NC State Extension plant toolbox (as *L. acuminata*): https://plants.ces.ncsu.edu/plants/lonicera-acuminata/common-name/vine-honeysuckle
- Rainyside Gardeners: https://rainyside.com/plant_gallery/vines/Lonicera_henryi.html
- Amt für Umwelt Thurgau, leaflet "Henrys Geissblatt": https://umwelt.tg.ch/public/upload/assets/103863/Henrys-Geissblatt.pdf
- German garden guides, used for light and winter behaviour only: https://www.gartenjournal.net/geissblatt-immergruen and https://www.naturadb.de/pflanzen/lonicera-henryi/
- US Plant Patent PP21,819, *Lonicera* 'Inov42' (*L. henryi* x *japonica*): a hybrid, used only as the nearest measured relative where nothing is measured on *L. henryi*: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/PP21819
- Photographs of identified plants on Wikimedia Commons (category "Lonicera acuminata"), looked at for form and colour and named one by one in `morphology.json` and `model.json` where a reading was taken from them.
- Not seen: Stace, *New Flora of the British Isles*; the full text of Weber (2005); the Flora of China page itself (read from a mirror); a facade-greening supplier's page on the plant, which refuses automated readers.

**Status:** form and growth described from floras, one measured population and photographs (November 2026); nothing measured on a Bower or on a British plant; site fit must be reviewed.
