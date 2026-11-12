# Hydrangea anomala subsp. petiolaris

**Common name:** Climbing hydrangea  
**Accepted name:** *Hydrangea petiolaris* Siebold & Zucc. at both the RHS (record 8948) and Kew; *H. anomala* subsp. *petiolaris* is a synonym at both.  
**Place in palette:** OPTION — cool/part-shade sector with compatible attachment substrate

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Large deciduous self-clinging climber; slow establishment possible. |
| Climbing or support mechanism | Adventitious aerial roots on stems, requiring contact with a suitable surface. |
| RHS ultimate-height envelope | RHS: >12 m; 10–20 years to ultimate size class. |
| Hardiness | H5 (RHS). |
| Flower / leaf / fruit season | White early-summer flowerheads, often around 20 cm wide; yellow autumn foliage, leafless in winter. |
| Aspect and exposure | Part shade, including cool/east/north sectors; full sun only where soil stays moist; shelter helpful. |
| Soil | Moist, well-drained, humus-rich; RHS often favours acid/neutral. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Species-specific biological logic

Climbing hydrangeas flower on **last year’s shoots**; distinguish early slow establishment from later vigorous lateral expansion.

## What Bower must provide: local supports

Compatible broad textured/contact panel or dedicated support in partial shade; cannot be assumed to climb arbitrary smooth cable, and do not permit root intrusion into timber crevices.

## Global structure placement logic

Shaded wall-like Bower section or substrate panel; not automatically an ideal open lattice climber.

## Gardener intervention / pruning

Prune after flowering only where needed, secure establishment, water in dry periods and inspect contacted substrate.

## Interactions with the broader palette

Offers white flowers and shade coverage; takes significant time and space, competes with other lower shade species.

## Risks, exclusions and scientific caveats

Self-clinging behaviour is substrate-specific and may obstruct inspection; initial growth may be slow. Skin allergen; harmful to dogs and cats if eaten (RHS).

## Parameters to obtain or calibrate

Aerial-root attachment by texture/humidity, establishment delay, progression from juvenile to mature canopy, last-year floral shoot survival, shade response.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Light, aspect and shelter

What the sources say, for the light model. None of it is acted on by the engine yet: the growth model has one flowering share and one growth rate whatever the light.

| Question | What is recorded | Source |
|---|---|---|
| Light classes accepted | **Full sun or partial shade** in the RHS record; full shade is not ticked there. Other sources go further: it "grows in full shade" (Morton Arboretum), takes partial shade, dappled sunlight and deep shade (NC State Extension), and is "almost as shade tolerant as ivy" (a Polish climber nursery). Treat full shade as tolerated for growth, not as an RHS class. | RHS record 97624; Morton Arboretum; NC State Extension; clematis.com.pl |
| Recommended aspect | RHS record: east-, north-, south- or west-facing. RHS guides: ideally a **north- or east-facing** wall or fence; a sunnier place only "if the soil does not dry out in summer". | RHS record; RHS climbing hydrangea guide and growing guide |
| What the aspect is asked for | **Coolness and moisture, not light or warmth.** The cool walls are recommended because the plant does without sun and dislikes hot, dry places ("very hot, dry spots are unlikely to suit it", RHS; "avoid hot, dry sites", University of Connecticut; it "avoids heat" and prefers cool, humid sites, lve-baumschule.com). Sun is acceptable where the root run stays moist. | RHS guide; University of Connecticut; lve-baumschule.com |
| Shelter | RHS record: **sheltered**. The reason given elsewhere is the young growth and the flower buds, not the hardiness of the wood (H5): "young growth is prone to frost damage in spring", avoid frost pockets and strong winds (Gardeners' World); hard frost can damage last year's shoot tips, which carry the flowers (RHS growing guide); buds can be damaged by late frosts because it blooms on old wood (Morton Arboretum). | RHS record; RHS growing guide; Gardeners' World; Morton Arboretum |
| What shade does to growth | Little, once established: it "grows equally vigorously in sun or shade" if moisture is adequate. | Trees and Shrubs Online |
| What shade does to flowering | It reduces it: flowering is "most abundant in more or less full sun"; a shaded wall "flowered only moderately" while a clump in brighter conditions flowered freely. "Flowers best in full sun but grows in full shade." | Trees and Shrubs Online; Morton Arboretum |
| What sun does to the flowers | They do not last as long in sun. | Gardeners' World |
| What too much sun or exposure does | Hot, dry sites do not suit it (above); in the hot summers of Arkansas it "must be planted in at least partial shade"; south-facing sides are the one urban position a German nursery excludes. It does not tolerate drought, least of all in its first years, and a wall keeps rain off its roots. No source read describes leaf scorch as such. | University of Arkansas; lve-baumschule.com; clematis.com.pl; RHS growing guide |
| On fresh lime | It climbs poorly on fresh, limy render until the lime has stopped burning the rootlets. Not a light matter, but a surface one. | clematis.com.pl |

## Form: what the model draws

**The plant.** A deciduous root climber with two kinds of shoot. *Extension shoots* creep over the timber and cling to it by a fringe of short rootlets on the side that touches it; these are the engine's framework stems, red-brown when young, and with age clothed in thin bark that peels in cinnamon strips. *Side shoots* stand out from them, do not root, and carry nearly all the leaves and every flowerhead. The plant is slow for three to five years and then vigorous.

**Leaves** stand in opposite pairs on long stalks (3 to 9 cm under a blade of 5.5 to 12 cm): broadly ovate, cut square or shallowly heart-shaped at the base, drawn out to a short point, finely saw-toothed, dark and glossy above, with six to eight pairs of side veins. They open from the end of March, are light green at first, turn clear yellow briefly in late October and November and fall.

**Flowerheads** are flat corymbs 10 to 20 cm across at the ends of side shoots that were there the year before. Each is a froth of small creamy fertile flowers, which open by dropping a cap of petals and are little more than a tuft of 15 to 20 stamens on a green cup, ringed by about ten to fifteen showy sterile flowers of four white sepals on stalks of their own. They show in May, open through June and last about three weeks. The sterile flowers do not fall: the head turns green, then brown, and stays on the bare plant through winter, its capsules 3 mm urns with two horns.

**Through the year on the model.** January: bare framework on the timber with its fringe of rootlets, bare side shoots, brown dry heads. Late March to early May: leaves flush. May: flowerheads in bud. June into July: flowerheads open from the edge of each head inwards. July to October: green heads browning. Late October and November: yellow leaves, then leaf fall. First heads in the fifth or sixth summer.

**Where the model simplifies.**

- A side shoot is made its whole length in its first spring, in a straight line, and never lengthens, forks or bends. In life a side branch adds two or three pairs of leaves a year, forks below each spent head, and after a decade or two can stand well over a metre from the support as stiff, tiered, woody branchwork that nods a little at its tips. The model's shoots are given the reach of a branch some years old (12 to 60 cm) and leaves along their whole length to stand for that branchwork.
- Opposite pairs are not set crosswise to one another (decussate): every pair of a shoot lies the same way. The leaf models are held in six different postures so that a shoot does not read as one large pinnate leaf.
- One leaf size serves every shoot; the smaller leaves of creeping and juvenile growth are not drawn. Leaf nodes fall only on the engine's stem points, 4 cm apart.
- Flowering does not depend on light or on height on the plant. In life most heads are towards the top and in the sun.
- A flowerhead shows for a fixed month before it opens; in life it shows with the young leaves. Its sterile flowers are drawn white from the first; in life they are small and green until they expand.
- The filaments of the stamens are drawn about three times their true thickness so that they show at all, and a head draws 170 fertile flowers where a real one very likely has more.
- The dry head is a second model that takes the place of the flowerhead on the day the engine calls it over. Its width is drawn afresh, so a head may change size a little on that day.
- Rootlets are drawn as patches whose rootlets run out all round, because the render data does not say which way the stem runs across them; those along the stem are hidden beneath it.
- The two faces of a leaf are one colour; the paler, hairy underside is not drawn. Autumn colour is always full yellow; in a mild southern English autumn it is often no more than a tint.

The shape numbers are in [`morphology.json`](morphology.json) and the growth numbers in [`model.json`](model.json), each with its evidence status.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json) in this folder; shape characters in [`morphology.json`](morphology.json); growth assumptions in [`model.json`](model.json).
- RHS accepted record: https://www.rhs.org.uk/plants/8948/climbing-hydrangea/details
- RHS taxon profile (synonym record, where the traits above were read): https://www.rhs.org.uk/plants/97624/hydrangea-anomala-subsp-petiolaris/details
- RHS climbing hydrangeas guide: https://www.rhs.org.uk/plants/hydrangea/climbing and growing guide: https://www.rhs.org.uk/plants/hydrangea/climbing/growing-guide
- Trees and Shrubs Online, *Hydrangea petiolaris* (description after Ohba 2001 and Ohwi 1965, *Flora of Japan*): https://www.treesandshrubsonline.org/articles/hydrangea/hydrangea-petiolaris/ and *Hydrangea anomala* (after the *Flora of China*): https://www.treesandshrubsonline.org/articles/hydrangea/hydrangea-anomala/
- NC State Extension: https://plants.ces.ncsu.edu/plants/hydrangea-petiolaris
- Morton Arboretum: https://mortonarb.org/plant-and-protect/trees-and-plants/climbing-hydrangea/
- University of Connecticut plant database: https://plantdatabase.uconn.edu/detail.php?pid=209
- Virginia Tech dendrology factsheet: https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=284
- University of Arkansas: https://uaex.uada.edu/yard-garden/resource-library/hydrangeas/climbing-hydrangea.aspx
- US plant patents of two sports, each described from the plant: PP11,038 'Firefly' https://patents.google.com/patent/USPP11038P/en and PP13,845 'Kasai' https://patents.google.com/patent/USPP13845P2/en
- Nursery catalogues (growth rates, timing): https://www.lve-baumschule.com/hydrangea-petiolaris/6353928 and https://www.clematis.com.pl/en/vines-in-garden/ogrodowe-inspiracje/articles/396-climbing-hydrangea/
- Gardeners' World: https://www.gardenersworld.com/how-to/grow-plants/how-to-grow-climbing-hydrangeas/

**To check against `taxon.json`:** several sources call the fertile flowers fragrant (NC State "sweetly fragrant"; Morton Arboretum; University of Connecticut; patent PP13,845 "slightly fragrant"), where `taxon.json` records the plant as unscented from the RHS record's silence. Trees and Shrubs Online gives June to July for flowering in Japan, where `taxon.json` has June alone from the RHS wording.

**Status:** morphology recorded with sources; growth model rests on published descriptions and nursery figures, not on measurements; site fit must be reviewed for each project.
