# HORTICULTURAL_INTERVENTIONS — gardeners as agents

## 1. Operating principle

Bower's gardeners are **active state-changing agents**. They guide living plants into desired paths, keep the structure maintainable and produce the visual result. An unassisted plant simulation is not a Bower maintenance simulation. Human work should be present at the beginning of model design rather than patched in at the end.

The purpose is neither to automate gardeners away nor pretend perfect natural self-organisation: the long-term artistic result depends on biological growth **and deliberate horticultural composition**.

## 2. Event catalogue

| Event | Targets | Graph/state effect | Key recorded fields |
|---|---|---|---|
| `plant` | root station, new individual | Adds individual and root/node state | planting date, stock size/age, cultivar, root condition, soil |
| `train_leader` | living stem, desired support route | Changes growth direction/selection; may add temporary ties | gardener ID, route ID, angle, tie type, target position |
| `tie_in` | stem, local support | Adds explicit mechanical attachment (not self-clinging) | materials, slack/clearance, planned inspection date |
| `untie_or_reposition` | existing tie | Removes/replaces connection; tests support continuity | old/new contact, stem diameter |
| `spur_prune` | selected lateral shoots and buds | Removes descendants/flower buds; changes next flowering probability | cut position, retained buds, date |
| `hard_prune` | whole axis / plant | Removes live architecture except retained base/canes | severity, regrowth response assumptions |
| `shorten_side_shoots` | side shoots, flowered or all; optionally free shoots of the year; old canes where congested | Cuts each shoot back to a share of its length (climbing rose, RHS pruning group 17), to a count of its nodes from its base (vine: to one or two buds in winter, five or six leaves in summer; Bean, of *Vitis*), or to within a distance of where it leaves its stem (ivy's adult growth), removing what stood beyond the cut (leaves, flowers, fruit, tendrils, prickles, descendants). After a winter cut the stub bears next season's side shoot; after a summer shortening the shoot stays and stops. Optionally cuts the oldest canes beyond a number down low to shoot again | rule and amount kept, which shoots, stub or shoot, canes kept, date |
| `trim_to_bounds` | free shoots of the year that hold nothing | Cuts off, where it leaves the timber, every free shoot whose tip stands further than a stated distance from it, with all it carried (ivy kept in bounds; RHS: "it is easy to keep ivy from straying out-of-bounds by annual pruning"). The model has no declared envelope: this distance is what "out of bounds" means in it | distance, date |
| `thin_canopy` | leaf/stem sectors | Changes light penetration, visual coverage and biomass | sector, removed volume, rationale |
| `deadhead_or_select_flowers` | inflorescences | Removes spent or excess flowers/fruit, affects visual output | target species, event date |
| `water` | root station(s) | Changes water resource state | amount, dates, soil response |
| `feed_or_mulch` | root station(s) | Changes nutrient/soil management state | material/type, quantity, caution |
| `remove_problem_growth` | invasions, stems, roots | Prevents forbidden attachment, conflicts, inspection obstruction | location, reason, before/after state |
| `annual_replant` | tender-seasonal planting pocket | Retires annual plant; installs new one in next season | source stock, season, cost, new ID |
| `monitor` | individual and supports | Adds real observations without changing the plant by default | photos, measured growth, damage, buds, pest/disease |
| `replace_failed_perennial` | dead/diseased individual | Ends old state and creates new individual; **no reset of neighbours** | cause, replacement age, establishment expectation |

Pruning should remove descendants in the plant graph and any associated organ/attachment states. Do not implement it solely as a visual trim of final mesh geometry.

## 3. Suggested annual cycle — UK baseline

**Winter (December–February):** wisteria maintenance and spur pruning (January–February); late-winter Group 3 clematis pruning; structural/tie inspections, easiest from December once deciduous stems are bare; manage evergreen competition. Wisteria is typically pruned a second time in summer.

Also in late winter: *Campsis* is spur-pruned to two or three buds (RHS pruning group 12). Climbing roses (RHS pruning group 17), December to February: flowered side shoots cut back by two thirds, and really old canes taken out at the base where the plant is congested; through the summer they are deadheaded, until the last flush where hips are wanted (`shorten_side_shoots`, `deadhead_or_select_flowers`; the routine in the core is `climbingRoseRoutine`).

The crimson glory vine (*Vitis coignetiae*, RHS pruning group 11, "in midwinter, and in midsummer, if restricted growth is required"): every shoot of the year that is not framework, flowered or not, and every free cane, cut "hard back in December or January to one or two buds (later pruning causes bleeding)", and the young shoots "shortened back once or twice during the summer" (Bean, of the genus, https://www.treesandshrubsonline.org/articles/vitis/). In the core: `vineRoutine`, 15 December, and 7 July and 15 August, to five or six leaves; a shoot ending in a bunch is left in summer, because the model puts the bunch at the shoot's end. The framework is not cut: a bound for it has to be declared by a design.

Ivy (*Hedera helix*, RHS pruning group 11, at any time): kept in bounds by annual pruning, outside the nesting season, which "generally lasts from March to August" (RHS, ivy on buildings). In the core: `ivyRoutine`, 25 February every year, free juvenile shoots standing out more than 0.5 m cut off at the timber (`trim_to_bounds`); 5 September every second year, adult growth cut back to within 0.5 m of its stem (`shorten_side_shoots`). Nothing is cut from March to August.

**Spring (March–May):** inspect winter survival; position and tie spring extension; prune Group 1 clematis (*C. cirrhosa*, *C. armandi*) immediately after flowering in mid to late spring, and only if needed, because they flower on the previous summer's shoots; replant *Thunbergia alata* after frost risk in late spring; monitor wisteria flower performance; manage roots and irrigation.

**Summer (June–August):** continuously observe and guide new leaders; summer wisteria pruning generally July–August; train rose canes, manage honeysuckle/clematis and control *Vitis*; prune climbing hydrangea and *Lonicera periclymenum* after flowering where needed (RHS pruning group 11); maintain visibility and circulation.

**Autumn (September–November):** inspect lignification, developing flower buds and autumn colour; remove unwanted invasive/seeded spread; assess support clearance and winter exposure; stage next year's pruning/replacement plan.

**Important:** this is **not a one-visit-per-year scheme**. One *annual replanting* can be enough for the tender annual colour module, but perennial climbers demand multiple gardening/inspection interventions. Events are adjustable to plant age, site and cultivar.

## 4. Gardener objectives and preferences

Each Bower has a management policy with hard restrictions and artistic priorities:

- Preserve principal wisteria leaders and flowering spurs without sacrificing inspection/safety.
- Achieve seasonal composition while retaining chosen bands of visible timber.
- Maintain minimum public headroom, circulation and safe thorn/fruit exposure.
- Keep established evergreen sections **bounded**, not allowed to suffocate neighbouring species.
- Direct shoots to architecturally preferred branches and allow replacement of failed plants.
- Prevent root, moisture and foliage problems at sensitive timber junctions.
- Minimise maintenance burden **subject to horticultural adequacy**, not by assuming no intervention.

## 5. Gardener scheduling logic

Treat maintenance as a sequence of allowable actions with consequences:

1. Observe the current plant graph, season, meteorology and support graph.
2. Prioritise safety/inspection and health, then flower/foliage composition.
3. Select actions within feasible access and horticultural windows.
4. Apply each operation, mutate plant/contact graphs, then re-run relevant developmental responses.
5. Record expected vs actual outcome and add observations for calibration.

The first implementation may use explicit scripted maintenance calendars. Later it can evolve into interactive scheduling or a planning agent. Do not let an AI gardener silently invent botanical facts or bypass physical access constraints.

## 6. Minimum observation log for a future Bower prototype

Record plant ID, taxon/cultivar/propagation type, stock age/height, rooted soil conditions, observed leader path, monthly new shoot length, internode samples, leaf emergence, flower initiation/open dates, surviving winter leaves, contact successes/failures, pruning cut location, resulting regrowth, photographs with scale and gardener hours. Distinguish measured values from impressions.
