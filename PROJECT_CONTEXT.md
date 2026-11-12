# PROJECT_CONTEXT — Why Horti-code-ture exists

**Project:** Horti-code-ture  
**Owner / design context:** Bower — living architecture (`bowerbuild.org`)  
**Audience:** autonomous and human software, design, botanical, horticultural, and engineering collaborators  
**Status:** product and research intent; not a claim of validated biological or structural prediction  
**Last updated:** 11 November 2026

> **A Bower is a building that grows.**
>
> The architecture provides an intentional, constructed framework. Plants, weather, seasons, and gardeners transform it into an inhabited garden over time. The living growth is part of the architecture, not decoration applied after construction.

## 0. Read this before making global decisions

This is the **purpose and decision-making document** for the entire repository. It answers why this software should exist, what it should optimise, what it must never assume, and how to decide between competing implementations.

When there is a conflict:

1. Protect **biological and mechanical plausibility** and **public/structural safety**; do not misrepresent guesses as measured predictions.
2. Preserve the **architectural premise**: designed timber geometry and living plant development form a single time-dependent work.
3. Produce **useful design decisions** with the simplest model that can support them; don't build elaborate science that the immediate design problem does not require.
4. Optimise for **beauty across different seasons and ages**, not maximally uniform green coverage.
5. Include **human gardening as deliberate authorship and operational reality**, not as an embarrassing exception to autonomous growth.
6. Prefer **explainable, editable, transferable models** over a visually impressive black box.

Read the operational specifications after this file: `KEY.md` (planting and support design), `SIMULATION_KEY.md` (data and growth models), `CONSTRAINTS_AND_PHENOLOGY.md` (biological rules), `HORTICULTURAL_INTERVENTIONS.md` (gardener actions), `DEVELOPMENT_GUIDE.md` (implementation order), and the individual species profiles.

## 1. What Bower is trying to create

Bower develops inhabitable, site-specific architectural structures formed from a **curved timber lattice** and colonised by living plants. The timber is designed and manufactured; the living architecture is then **cultivated**. Depending on the commission, a Bower may become a pavilion, garden room, event enclosure, amphitheatre, shaded gathering space, entrance or other public destination.

The intention is not to reproduce a conventional conservatory, cover a building in a green texture, or assume that a plant will automatically do the designer's work. The timber must be compelling on its own, and the garden must meaningfully alter spatial experience, shade, colour, light, scent, habitat, and the character of the building over the years.

The shorthand **“Year 1: lattice; Year 2: leaves; Year 3: room”** communicates a desired narrative of transformation, **not a horticultural warranty**. Growth varies by species, plant size at installation, rooting conditions, microclimate, season, training intensity, and geometry. The modelling effort should help discover what is realistically achievable and at what cost and time, rather than force biology to match a slogan.

**The timber is the growing surface.** The primary structure is curved glulam, and the plants are meant to grow on it: twining round it, lying along it, clinging to it, wherever they find a hold. Between the main beams a finer sub-lattice of lighter timber and, where timber cannot do the job, slender steel cables gives smaller plants something to grasp. Visible steel is kept to a minimum: cables, never steel rods or frames.

This project exists because **the eventual form of a Bower is not fully determined when the timber is fabricated**. Architecture, horticulture, fabrication, operations, and time must be designed together.

## 2. The central problem

Traditional parametric architecture can specify a built shape at the date of installation. Ordinary landscape plans can specify a palette and planting locations. Neither alone predicts how numerous climbing species will occupy a complex, curved, branching timber assembly over successive growing seasons, how they will interact, or what gardeners must do to achieve the intended experience.

For Bower, these are architectural design questions:

- Which plants can physically find and occupy the available routes from their root stations?
- Which climbing mechanisms can grasp the actual local support diameter and surface?
- What foliage and flowering will exist at specified dates, from specified visitor viewpoints?
- Will the timber remain legible as designed, or become completely obscured?
- Which species will outcompete or smother their neighbours?
- Where does the glulam need a finer sub-lattice (lighter timber, slender steel cables), ties, planters and maintenance access for plants to occupy it as intended, with as little visible steel as possible?
- How must gardeners train, prune, replace, and direct shoots to produce the intended composition?
- What might change after 1, 3, 5, 10, and 20 years, and how uncertain are those projections?
- When do vegetation, wet mass, potential wind exposure, stem thickening, or lack of access create reasons to revise the design or obtain engineering assessment?

Without a computational representation, the risk is to sell an attractive image while leaving major biological, operational, and structural questions unresolved. **Horti-code-ture is intended to close that gap.**

## 3. Why this is worth building

The same tool should eventually support several connected activities:

### 3.1 Design a better Bower

Design the timber as the plants' **growing surface**. The global curvature, the size and spacing of members and the finer sub-lattice determine which species can reach and hold which regions; the planting scheme, in turn, should influence member spacing, sub-lattice density, clearances, exposure, roots, irrigation, and access. The two designs should inform one another, rather than being sequential and disconnected.

### 3.2 Make time visible to architects and clients

Show plausible different seasonal and age states—not a single permanently flowering fantasy. A Bower in winter can be beautiful because of visible timber, woody branching, selective evergreen foliage, scent, winter flowers, and light; it does not have to look like summer in December.

A rendering is a **visual communication of a scenario**. A forecast is an **evidence-based estimate with uncertainty**. Never label one as the other.

### 3.3 Make planting choices defensible

Select a palette by local climate, geometry, support mechanism, root conditions, flowering biology, competition, and management capacity. The goal is a **repeatable decision system** for site-specific compositions—not a mandatory recipe containing every taxon listed in this repository.

### 3.4 Make horticultural maintenance part of the product

Bower's gardeners will cultivate the architectural outcome. Pruning, training, plant replacement, and inspection are not failures of the algorithm; they are part of the design process. The software should make this labour imaginable, schedulable, and eventually measurable.

**The gardened plant is the baseline (owner's decision, 12 November 2026).** A Bower will have an in-house gardener, and the wisteria will be pruned. The plant a client is shown, and the one a design is judged by, is therefore the plant as that gardener keeps it: trained, tied in and pruned on its own routine. A run with nobody gardening is a comparison that shows what the care is worth; it is not a prediction of what will stand on the building. It follows that every taxon needs its routine of care in the model, as the two wisterias and the cut-down clematis already have theirs, and that a fault which shows only on a neglected plant matters less than one that shows on a kept one.

A composition that only works if nobody ever prunes, if plants magically attach themselves to unsuitable timber, or if an inaccessible crown needs weekly attention is not an acceptable design.

### 3.5 Inform fabrication and engineering decisions

Longer term, route placement, plant support details, access points, moisture exposure, and the way thickening stems meet timber connections may become inputs to detailing and fabrication. **Do not use unvalidated biological mass/force estimates as certified structural loads.** Structural engineers and qualified horticultural professionals remain responsible for real projects.

### 3.6 Build transferable design capability

A successful model should work on more than one spectacular prototype. Its abstractions should transfer between species, scales, sites, and future commissions without copying a hard-coded wisteria animation onto every plant. This is potential proprietary know-how for Bower, but scientific and practical credibility matters more than the appearance of sophistication.

## 4. Scientific starting point and scope

The current computational point of departure is an existing generative algorithm for ***Wisteria sinensis***. Preserve that work. Use it as the reference case for generalising plant architecture, then implement additional species with explicitly different attachment and phenological rules.

The repo includes **17 taxa/cultivars** discussed for potential Bower use. They are a **candidate library**, not a scientifically proven assemblage and not all required in one building. Examples of functional roles:

- **Long-lived woody framework:** *Wisteria sinensis* or *W. floribunda* 'Macrobotrys'.
- **Evergreen continuity:** *Lonicera henryi*; sheltered-site *Trachelospermum jasminoides*; exceptionally controlled *Hedera helix* where appropriate.
- **Flowering succession and human-scale detail:** summer clematis, winter-flowering *C. cirrhosa*, honeysuckle, climbing rose.
- **Autumn accent:** carefully bounded *Vitis coignetiae*.
- **Temporary annual colour:** seasonally replanted *Thunbergia alata*.
- **Ground-adjacent scent:** *Sarcococca confusa* (a shrub, **not a climber**).

Baseline reference climate: **temperate United Kingdom**. Every new site requires reassessment of sun, climate, wind, hardiness, soils, ecology, irrigation, legal constraints, and maintainer capacity. A species that is beautiful in a sheltered British courtyard may be inappropriate on an exposed, elevated shell or in a different biome.

Scientific modelling should proceed from **basic functional–structural plant models**, not from assumptions that one biologically universal growth equation exists. Preserve individual stems, growth cohorts, attachment contacts, bud history, leaf states and gardener actions. Start with defensible coarse approximations; add physiological detail only when it changes a decision.

## 5. Three things that must never be collapsed into one

### A. Manufactured architecture

The Bower timber lattice, connections, foundations, permanent supports, inspection spaces, visitor clearances, and relevant material exposure. It has its own geometry, graph and engineering responsibilities.

### B. Living plant architecture

A changing plant graph: roots, woody leaders, new shoots, buds, foliage, flowers, fruit, attachments, growth history and senescence. **“Old wood” in flowering discussions means the plant's own older stems**, not the manufactured timber. The distinction matters because pruning a last-year wisteria flowering spur removes the flower buds it carries; pruning a current-season-flowering clematis has a different effect.

### C. Human horticultural action

Gardeners choose leaders, train shoots, move ties, prevent tangles, reduce competition, prune for flower or access, replace annuals, monitor health, and sometimes deliberately expose timber. These actions change the living graph and the final architecture. Record interventions as events so outputs can be explained.

These three systems interact, but remain distinct entities in data and software design.

## 6. What “beautiful year-round” means operationally

Do **not** define beauty as 100% leaf coverage or 12 months of abundant flowers. Such a target would erase much of the structure's architectural character and cannot reliably be achieved across a large temperate Bower.

Instead optimise for **seasonal succession**:

- **Late winter / early spring:** architectural silhouette, selected evergreen cover, winter-flowering clematis at accessible lower levels, occasional scent and visual depth.
- **Spring:** new leaf emergence and a conspicuous wisteria flowering moment where the climate and plant history permit it.
- **Summer:** comfortable shade, leaf density where needed, colour and scent from summer climbers, useful inhabited rooms.
- **Autumn:** changing foliage colours, fruit and selected late flowers, texture and a gradual reveal of the timber skeleton.
- **Winter:** visibly designed timber, persistent woody pattern and carefully located evergreen zones; no requirement for false full-canopy greenery.

A good composition may have **exposed lattice, dense green areas, flower-focused areas, and deliberately quiet areas** at the same time. Views from underneath and at entrances often matter more than a uniformly lush aerial view.

Planting once should establish the permanent layer; **one annual replanting** may replenish temporary colour. That does **not** replace the need for repeated seasonal pruning, training, plant care and inspections.

## 7. How agents should make decisions

Use the following hierarchy. A proposed change should identify which design criterion it improves and what it sacrifices.

1. **Safety and longevity:** preserve inspection access, human clearances and any exclusions a project declares; watch where thickening stems bear on connections. Flag unresolved loads or biological hazards for specialists.
2. **Biological credibility:** mechanism-correct attachment, realistic seasonal behaviour, persistent plant history, and no invented growth rates presented as fact.
3. **Spatial and aesthetic experience:** dynamic beauty from human viewpoints, recognisable timber, flowers/scent/shade where people encounter them, and meaningful seasonal difference.
4. **Cultivability:** roots and water are available; supports are accessible; gardeners can actually keep the intended composition over decades.
5. **Generality:** the system is reusable across the named species, support graphs and project scales, not tuned only to one example picture.
6. **Interpretability:** outputs explain why a species reached or failed to reach a zone, why flowers appeared or did not, and what gardener actions changed.
7. **Performance and sophistication:** optimise runtime and advanced biophysics once the above work. Prefer the smallest useful scientific model.

**When objectives compete:** Do not automatically pick the greenest, most photogenic or least expensive option. Show the trade-off. For example, an evergreen that blocks spring wisteria flowers or prevents timber inspection can be worse than a sparser winter composition.

## 8. What the first version should actually do

An early release succeeds if it can:

- Load a curved Bower region as **glulam members plus their sub-lattice** (lighter timber and cables), all of it available to plants as routes.
- Introduce ***Wisteria sinensis*** at one or more root stations; preserve its woody stem history over multiple years.
- Simulate plausible branching and attachment attempts to legitimate supports, with failure where contact is unsuitable.
- Represent winter/spring/summer/autumn states, including old-wood flower-bud dependence for wisteria.
- Allow a gardener to train, prune, inspect and redirect growth through explicit commands/events.
- Output intermediate plant geometry and a traceable explanation of why growth occupies a particular route.
- Add at least **one evergreen** (e.g. *Lonicera henryi*) and **one current-season-flowering clematis** (e.g. *C. viticella*) without assuming that their climbing and flowering biology are identical to wisteria.
- Report coverage, flower locations, unreachable paths, conflicts and management actions, with assumptions clearly tagged.

The first release does **not** need perfect physics, a detailed root physiology model, reliable 20-year load predictions, or photorealistic renderings. The geometric experiments and mechanistic model should be **good enough to affect a planting/support decision**.

## 9. What the system is *not*

- **Not:** an AI renderer that produces arbitrary lush plants over a building.
- **Not:** a promise that a Bower is fully grown or flowering by a specific date.
- **Not:** an autonomous plant-care system that removes the gardener.
- **Not:** a generic ivy/wisteria asset library with different textures on the same geometry.
- **Not:** a substitute for botanical field work, qualified horticultural specification, arboricultural judgement or structural engineering sign-off.
- **Not:** a requirement to simulate every ecological, biochemical or mechanical process before a useful design is produced.

## 10. Decisions that are allowed to remain uncertain

Unknowns are not bugs. Maintain source and uncertainty metadata for:

- Shoot extension and branching responses for each cultivar under different conditions.
- Successful attachment by local support diameter, orientation, material and weather.
- Time to occupy curved structures, including realistic training paths and plant competition.
- Pruning effects, flower-bud initiation and seasonal timing under local conditions.
- Evergreen survival and leaf retention on exposed, elevated sites.
- Long-term weight, water retention, wind behaviour and stem/support interaction.
- Required gardener time and maintenance cost by species and complexity.

Do not silently invent missing numbers to complete a visual. Use provisional assumptions marked as such, uncertainty ranges where supportable, and experiments to narrow critical unknowns. Relevant validation may come from small lattice prototypes, measured shoots, nursery-grown plant trials, and monitored plant/support systems.

## 11. An agent's test for whether a feature belongs

Before adding a feature, answer:

1. **What Bower design decision would this help someone make?** (A clear answer is required.)
2. **Does it represent a real difference between plant species, sites, support geometries, or gardener actions?**
3. **What biological evidence or clearly labelled assumption supports it?**
4. **What simpler abstraction would answer the same question well enough?**
5. **Can an architect or horticulturist understand the outcome and intervene?**
6. **What would falsify or invalidate the behaviour, and how could it be tested?**

If no design decision is improved, defer the feature. If behaviour is visually appealing but botanically false, revise it or label it explicitly as artistic, not predictive.

## 12. Long-term ambition

The long-term opportunity is a system that **co-designs manufactured and biological architecture**: a specific timber geometry, its secondary climbing surfaces, a suited plant community, growing trajectories, and an evolving human maintenance plan. Over time, measured observations could improve species calibration, bring design intent closer to growth outcomes, and inform fabrication details and future commissions.

The deeper ambition is a new architectural practice in which **the gardener is a co-author** and time is part of the design brief. The software should help make that proposition **beautiful, repeatable, buildable and intellectually honest**.

> **North star:** Do not merely simulate plants on architecture. Help Bower design architecture that plants and gardeners can genuinely finish.
