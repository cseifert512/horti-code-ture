# Clematis cirrhosa 'Freckles'

**Common name:** Winter-flowering evergreen clematis 'Freckles'  
**Accepted name:** RHS: *Clematis cirrhosa* var. *purpurascens* 'Freckles' (C) (record 89092); *C. cirrhosa* 'Freckles' is an RHS synonym.  
**Place in palette:** CORE CONDITIONAL — lower winter floral module

## Observational / horticultural baseline

| Trait | Currently supported description |
|---|---|
| Growth habit | Evergreen woody clematis; Group 1 pruning class. |
| Climbing or support mechanism | Twining leaf petioles, not heavy-stem twining. |
| RHS ultimate-height envelope | RHS: 2.5–4 m; generally 2–5 years to ultimate size category. |
| Hardiness | H4 (RHS). |
| Flower / leaf / fruit season | Cream/yellow bell-shaped flowers with red spotting from late autumn through winter into early spring; silky seedheads later. |
| Aspect and exposure | Sunny, warm **sheltered** south/west exposure; cooler/shaded base beneficial. |
| Soil | Fertile, well-drained, neutral-to-alkaline preferred for the cultivar. |

**Evidence discipline:** height classes and mature size times are qualitative UK horticultural descriptors, **not** yearly extension, support-path reach or physical force values. This file makes no claim to cultivar-calibrated numerical growth rates.

## Species-specific biological logic

Cirrhosa group flowers on **previous-year growth**; track overwintering bud-bearing shoot cohorts and possible extreme-cold leaf damage.

## What Bower must provide: local supports

Fine petiole-friendly wires/mesh and clear lower routes; do not require petioles to clasp a massive glulam beam.

## Global structure placement logic

Near visitors and entrances at ~2–4m scale; NOT expected to create dense winter flowers at 12m crown height.

## Gardener intervention / pruning

Light pruning only after bloom when needed; do not hard-prune during the previous-year budding/flowering period unless a lost display is acceptable.

## Interactions with the broader palette

Can augment *Lonicera henryi* winter foliage in adjacent lanes; avoid strong summer canopy shading and entanglement.

## Risks, exclusions and scientific caveats

Winter flower quantity is weather-dependent; H4 requires site matching; may be less evergreen during adverse winters. Skin irritant; harmful to pets (rabbits) if eaten (RHS).

## Parameters to obtain or calibrate

Winter flowering response; bud initiation timing; prior-year branch survival; petiole graspable diameter range; leaf retention.

At minimum, bind all measured parameters to plant **age**, plant **part**, time step, site/climate, support properties and propagation/stock history. Keep missing values empty rather than extrapolating from species names or RHS maturity classes.

## Immediate agent task

The botanical curator should confirm taxon/cultivar identity; attachment agent should define a contact/failed-contact test; phenology agent should specify seasonal organ states and flowering-wood rules; gardener agent should turn the management note into observed interventions. See root `CONSTRAINTS_AND_PHENOLOGY.md` and `HORTICULTURAL_INTERVENTIONS.md` for shared specifications.

## Source / provenance

- Validated data for this taxon: [`taxon.json`](taxon.json) in this folder.
- RHS main record: https://www.rhs.org.uk/plants/89092/clematis-cirrhosa-var-purpurascens-freckles-c/details
- RHS taxon profile (synonym record, where the traits above were read): https://www.rhs.org.uk/plants/223017/clematis-cirrhosa-freckles/details

**Status:** initial handoff profile; site fit must be reviewed, no numerical simulation calibration yet.

## Light, aspect and shelter

(Read 13 November 2026. Sources: RHS record 89092, https://www.rhs.org.uk/plants/89092/clematis-cirrhosa-var-purpurascens-freckles-c/details ; Ashridge Nurseries, https://www.ashridgetrees.co.uk/clematis-cirrhosa-freckles ; Thorncroft Clematis, https://www.thorncroftclematis.co.uk/cirrhosa ; Crocus, https://www.crocus.co.uk/plants/_/clematis-cirrhosa-var-purpurascens-freckles/classid.872/ ; Plant Delights, https://www.plantdelights.com/products/clematis-cirrhosa-freckles .)

- **Light classes accepted.** The RHS record gives full sun only. Growers are broader: Thorncroft and Crocus give sun to part or light shade; Plant Delights sun to part sun, with a sunny western exposure best. Full shade is given by no source.
- **What the recommended aspect is for.** The RHS asks for a south- or west-facing, sheltered site and calls it "a cultivar for a warm, sheltered position". That is mostly warmth and shelter, not light: the plant is H4 (hardy to about -10 to -5 degC), Ashridge says it is hardy to about -10 degC with drainage and shelter, that cold north or east winds can damage the buds, and that a sharp December frost can damage the open flowers (the plant makes more). The light model shades and nothing else; warmth, wind and frost are not modelled and are reported here, not folded into light.
- **What shade does.** No source measures it. The flowers come on last summer's shoots in the depth of winter, so a site with little winter sun is expected to flower less; the growers' "part shade" is taken to mean the plant grows there and flowers less. The RHS also advises keeping the base shaded and cool, which is about the roots, not the shoots.
- **What too much sun or exposure does.** In hot dry summers the plant rests: its leaves may brown or partly drop in July and August and it grows again from about September (Ashridge; Thorncroft: a natural dormant period in mid summer; Bean: it "can aestivate through hot dry summers by shedding its foliage"). This is drought and heat on a sunny wall, not light as such. Exposure to cold wind damages buds and flowers (Ashridge).

## Care: what the gardener does

RHS pruning group 1 (https://www.rhs.org.uk/plants/clematis/group-one-pruning-guide): prune "immediately after flowering", only once the danger of frost has passed; regular pruning is not needed; trim overlong branches and remove dead or winter-damaged shoots back to a pair of healthy buds; old congested plants are better renovated (all stems almost to the base just after flowering, then not again for at least three years) than thinned. Tie in new growth and space the stems evenly through spring and summer. A newly planted clematis is cut in its first spring to a strong pair of buds about 30 cm above the soil to make it branch from the base. For this cultivar: no hard pruning, a light prune in spring after flowering if needed, no autumn pruning, which would take next winter's buds (Ashridge); "It can be cut back to 1 metre" after the main flowering, and pruning is not necessary where there is room (International Clematis Society, https://internationalclematissociety.org/?p=742).

For Freckles, whose flowers end in February or early March, the gardener's year on a Bower is therefore:

- in the planting spring, the stems cut to about 30 cm above the soil (first year only);
- every year in late March, after the last flowers and the worst frosts: shoots standing out from the support beyond about 30 cm and holding nothing cut back to the support, dead and frost-damaged shoots removed;
- April to September: new shoots tied in and spread evenly over the support (the model's `tieToTimber` already does this for a trained plant);
- every eight to ten years, if the plant has become congested, all stems cut almost to the base just after flowering (renovation; not modelled here).

The model does not act on any of these today (only the routines listed in `MODELLED_ROUTINE` in `packages/core/src/sim/planting.ts` are). Written as events, the routine is given in the agent's report for the integrator to add.

## Form: what the model draws

Through the year a trained plant is a mass of slender, wiry stems, red-purple when young and red-brown after, tied over the frame and hanging in curtains of new growth where it runs out of support. Its leaves are opposite. Those of the long shoots are ternate: a stalk that may wind once round a wire and harden, and three toothed, shallowly lobed leaflets, the end one the largest. Those of the short shoots, clustered in the axils of older stems, are simple, broadly ovate, shallowly three-lobed and coarsely toothed. Both are glossy dark green with pale, palmately spreading veins, and stay on the plant through two winters; the oldest fall in the summer rest of their third year.

From late October to February the flowers hang singly from the leaf axils of the summer's shoots and at the ends of short shoots, each on a long stalk with a small green cup of two joined bracts at the base of the flower: a wide bell of four tepals, cream and faintly pink-streaked outside, cream inside and freckled so thickly with wine-red streaks that they run together through the middle, round a boss of green-yellow stamens. As the tepals fall the styles lengthen into a hanging brush of silky, feathered tails, green-white in late winter and drying to a pale buff fluff in spring before they blow away in early summer.

Where the model simplifies:

- The International Clematis Society calls the cultivar "fern-leafed" and Ashridge its foliage finely divided and fern-like, as Bean describes var. balearica, from whose seed it was raised; photographs of the cultivar (Wikimedia Commons, listed in morphology.json) show broad, toothed, shallowly lobed leaflets and simple leaves, and that is drawn. A more finely cut, two-ternate leaf is not.
- The bronze tinge of the leaves in winter (RHS) is not drawn: the render data gives an evergreen leaf no season of colour.
- One flower stands for the one or two of a leaf axil.
- A short shoot is drawn longer than the cluster of leaves it is on the plant, because the engine sets leaf nodes 4 cm apart.
- The summer rest is drawn only as the fall of the oldest leaves in June to August; growth itself is spread over the season as one hump.
- A young seed head and a ripe one are the same model, its tails spread between the two; the colour dries from green-white to buff.

**Note of 13 November 2026: the routine of care is now modelled.** Where this profile says that no routine is modelled for this plant, or that the model does not act on its care, that was so when it was written. The trained plant now has its routine (`MODELLED_ROUTINE` in `packages/core/src/sim/planting.ts`; `docs/ASSUMPTIONS_AUDIT.md` section 13): all stems are cut to 0.3 m on planting day, and each later year, on 25 March, shoots that hold nothing and stand more than 0.3 m from the timber are cut off.
