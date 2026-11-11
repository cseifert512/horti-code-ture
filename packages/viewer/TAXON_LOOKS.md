# Taxon looks: how a species is drawn

One file says everything about how one taxon is drawn: `src/plant/taxa/<taxon-id>.ts`, named for its folder under `species/`. This guide is for whoever gives a taxon its look. The standard to reach is *Wisteria sinensis* (`taxa/wisteria-sinensis.ts`), whose models came from the prototype.

Read `PROJECT_CONTEXT.md` first. Three of its rules decide most questions here:

- **A look is appearance, not growth.** Shapes, colours, gloss and how stiffly a flower is held live in the taxon module. How many organs there are, how long each is, where it sits and on which days it is there come from the render data, and are never decided here. A count or size of the real plant that a shape depends on (leaflets to a leaf, tepals to a flower) is read from `species/<id>/morphology.json`, where it has a source.
- **Looks do not transfer.** No taxon module imports another, however alike two plants are. Copy what you need and make it this plant's.
- **Visuals are proof.** A look is finished when its portraits have been taken and looked at, not when it type-checks.

## 1. The module

```ts
// <Botanical name>, and in a few lines what is modelled and from what.
import * as THREE from 'three';
import { Merge, type Segs, lin, palmateBlade, simpleLeaf } from '../kit.ts';
import { type LeafAsset, THIN_LEAF, type TaxonLook, type WoodLook } from '../look.ts';

function makeLeaf(variant: number, lod: number): THREE.BufferGeometry { /* ... */ }

const leaf: LeafAsset = { key: '<taxon-id>/leaf', variants: 2, lods: 3, make: makeLeaf, budget: [270, 104, 48], /* ... */ };
const wood: WoodLook = { /* ... */ };

export const look: TaxonLook = {
  taxonId: '<taxon-id>',
  provisional: false,
  leaves: { default: leaf },
  flowers: null,
  fruits: null,
  appendages: {},
  wood,
};
```

Rules the tests hold every module to (`test/looks.test.ts`):

- It exports one thing, `look`, and `look.taxonId` is the file's name.
- It imports only `three`, `@horti/core`, `../kit.ts`, `../look.ts`, `../stand-in.ts`, `../../util.ts`, and files of its own folder `species/<taxon-id>/`.
- Every asset's `key` begins with `<taxon-id>/` and is used once. The key names the instance pool, the cached geometry and the materials: two assets with one key would share colours.
- Every model builds finite geometry at every level of detail, within the triangle budget the asset states (section 6).
- `make(variant, lod)` gives the same geometry every time: use `RNG` or `hash2` from `util.ts` with fixed seeds, never `Math.random`.

A taxon that has no models yet has a module that spreads `standIn('<taxon-id>')` and says `provisional: true`. Replace the stand-in piece by piece, and set `provisional: false` once the leaf is the plant's own. `registry.ts` lists the modules; it needs no change unless a taxon is added to `species/`.

`src/plant/look.ts` is the interface, with a comment on every field. Read it once through: it is short.

## 2. Frames and units

All models are in metres or in units that the render data scales, three.js axes.

| Organ | Origin | Axes | Size |
|---|---|---|---|
| Leaf | where the leaf joins the stem | +Z along the leaf, +Y its upper side | **one unit long**, stalk and blade together. The viewer scales it by `RenderLeaf.lengthM` and turns +Z on to `direction`, +Y towards the sky |
| Flower, inflorescence | where it is attached | `poise: 'hangs'`: hanging along -Y. `poise: 'held'`: standing along +Y | `authoredSize` in the units of `RenderFlower.lengthM`; the viewer scales by `lengthM / authoredSize`. What `lengthM` measures is the taxon's (`flowerDisplay` in its growth model): the length of a raceme, the width of a single flower or of a flowerhead |
| Fruit | where it is attached | as a flower | `authoredSize` in the units of `RenderFruit.lengthM`: the length of the fruit itself when full grown |
| Appendage (tendril, coiled leaf stalk, rootlets, prickle) | where it leaves the stem | +Z the way it reaches, +Y towards the sky | **one unit long**, scaled by `RenderAppendage.lengthM` |

**Direction of a flower or fruit.** Where the data gives none, the model is drawn as authored (hanging or standing plumb), turned to a compass bearing of its own. Where the data gives one, the model's axis (-Y for `hangs`, +Y for `held`) is turned on to it and the model's **+Z is turned as far towards the sky as it will go**. So author a held flower with its stalk along +Y and whatever should face the sky on the +Z side.

The wisteria leaf is the one exception to "one unit long": by the prototype's convention its unit is the rachis and the end leaflet reaches past it. Do not copy that.

The stem, the leaf's seat on it and the sway of young wood are the viewer's work. A leaf or an appendage is seated on the surface of its stem as the stem thickens; a model need not allow for the stem's radius.

## 3. The kit (`src/plant/kit.ts`)

Geometry tools that belong to no taxon. If you need one more, add it to the kit only if it is as neutral as these; a shape that is one plant's goes in that plant's module.

| Tool | What it is for |
|---|---|
| `Surf` | Parametric surfaces. `sb.surf(nu, nv, (u, v) => ({ p: [x, y, z], c: [r, g, b] }))` adds a sheet of `nu x nv` quads; `sb.build()` gives geometry with position, colour, uv (= u, v) and smooth normals. Petals, blades, pods, tubes |
| `Merge` | Puts copies of small geometries together and tags every vertex with the part it belongs to (section 4). `new Merge(true)` for a leaf (keeps uv), `new Merge(false)` for anything in vertex colours. `mg.add(geometry, matrix, tint, pivot, t)`, `mg.tube(points, radii, sides, colourFrom, colourTo, uvAt?)`, `mg.build()` |
| `lin('#rrggbb')` | A screen colour as linear RGB, which is what vertex colours, palettes and wood colours are in |
| `mix(a, b, t)` | Between two colours |
| `triangles(g)` | How many triangles a geometry has: what a budget counts |
| `blade(shape, segs, fine)` | A simple leaf blade, base at the origin, tip at z = 1: width, where it is widest, taper, fold along the midrib, arch, wavy margin |
| `palmateBlade(shape, segs, fine)` | A rounded or lobed blade built as a fan from the stalk: body, lobes (angle, reach, width), the notch at the stalk, pucker between veins |
| `stalk(mg, length, radius, sides, droop?)` | A leaf stalk from the origin along +Z; returns its far end |
| `simpleLeaf(blade, stalkLength, lod, variation)` | A whole simple leaf, one unit long: a stalk and one blade |
| `compoundLeaf(leaflet, layout, lod)` | A leaf of leaflets along an axis (`CompoundLayout`: where each leaflet sits, which side, how long, their stalks, how they hang) |
| `stamens(mg, centre, axis, count, length, spread, sides, colourFrom, colourTo, seed, thickness?)` | A tuft of stamens, tagged as axis so that it stays when the petals drop |
| `across(axis)` | Two unit vectors square to an axis: for laying petals round it |
| `lathe(sb, segs, profile, colour, squash?)` | A body of revolution about Y: a berry, a hip, an urn, a tube |
| `path(n, at)` | Points along a curve, for `Merge.tube` |
| `coilPath(centre, axis, start, radius, turns, creep, n)` | A coil round a line: a hold wound round a cable or lath |
| `tendrilPath(shape, n)` | The centre line of a tendril or coiling stalk, one unit long: out along +Z, then wound round something lying across its way, or hooked where it found nothing (`turns: 0`) |
| `rootlets(mg, count, row, splay, thickness, sides, colourFrom, colourTo, seed)` | A patch of clinging rootlets in a row along Y, each reaching along +Z |
| `prickle(shape, segs, base, tip)` | A flattened, hooked prickle along +Z |
| `WHITE`, `MIDRIB`, `Segs` | White; where a stalk samples the leaf texture; the type of a segment count |

`util.ts` has `RNG` (seeded), `hash2(a, b)` (a fixed random number from two integers), `lerp`, `clamp`, `smoothstep`.

## 4. Parts: what `aPart` does

An organ is one instanced mesh, but it unfolds and sheds part by part. `Merge` writes a tag on every vertex, `aPart = (pivot x, y, z, t)`:

- **`t >= 0`: a part that comes and goes** (a leaflet; one flower of an inflorescence; one petal of a single flower). It grows and shrinks about its `pivot`, so give each part the point where it joins as its pivot.
- **`t < 0`: axis**, which stays (stalk, rachis, calyx, stamens, the frame of a seed head). `mg.tube` tags its rings so. To make a part added with `mg.add` stay, pass `t = -1`.

In a **leaf**, `t` (0 to 1) only varies the colour of a leaflet between the two greens of the palette; all leaflets unfold together as the core's leaf state goes from 0 to 1.

In a **flower**, `t` (0 to 1) is *when the part opens*: parts open in order of `t` as the core's time in flower runs through its first third, and drop in the same order from a little past half way, ending on the day the core calls the flower spent. Before it opens a part is drawn at 30% of its size in `budTint`. A part that has dropped is gone, so **whatever outlasts the petals must be axis**. That is how a clematis keeps its boss of stamens and a hydrangea its rays. Give a single flower's petals small `t` values close together (they open nearly at once) and a raceme's flowers `t` from 0 at the base to 1 at the tip. While the bud lengthens (before the core's `openDay`) every pivot is drawn in towards the attachment, so the organ lengthens out of its bud.

Fruit and appendages are not drawn part by part: a fruit scales as a whole with the core's size, an appendage is there or not.

All dates are the engine's. Nothing in a taxon module may know a day, a month or a season: `adapter.ts` is the only file where days become what is drawn.

## 5. Colour, gloss and translucency

| Organ | Where its colour comes from |
|---|---|
| **Leaf** | Not from vertex colours. The shader takes the asset's `palette` (`greenA` to `greenB` across leaflets, `young` while unfolding, `autumnA` to `autumnB` as the core's autumn state rises) and multiplies it by the shared leaf texture (pale midrib and side veins; `u` across the blade, `v` from base to tip, midrib at `u = 0.5`) and by a tone that varies a little from leaf to leaf. So a leaf needs `uv`: `Surf` gives it, `palmateBlade` lays it flat over the whole blade. An evergreen gives its greens again as its autumn colours. `roughness` is gloss (0.3 leathery and shiny, 0.65 soft and dull). `translucency` is how much light comes through from behind (`THIN_LEAF`, 0.45, for a thin leaf; less for a leathery one) |
| **Flower** | Vertex colours, in linear RGB (`lin`). Unopened parts are multiplied by `budTint`. `translucency` lets backlight through the petals; `sheen` adds the soft rim light of a velvety surface. Each instance is tinted a little warmer or cooler by the viewer |
| **Fruit** | Vertex colours are the unripe fruit. As the core's ripeness goes from 0 to 1 the colour turns to `ripe * (ripeShade[0] + ripeShade[1] * g)`, `g` being the green of the unripe vertex colour, so a pattern painted on the unripe fruit still shades the ripe one. `ripeShade: [1, 0]` gives a flat ripe colour |
| **Appendage** | Vertex colours. With `aged` set, they turn to that colour over `agedDays` (age in days since it formed): a tendril going woody |
| **Wood** | `WoodLook`, section 7 |

Colours are judged in the picture, in the scene's light, not as numbers. Take a portrait and look.

## 6. Levels of detail and triangle budgets

Each model exists at several levels of detail, 0 the finest. The viewer picks a level for each organ by its distance from the camera, and limits how many may be drawn at the finer levels at once.

- **Leaf**: up to three levels. They switch at `1.6 * detailReach` and `5 * detailReach` metres (a little farther at full detail), and at most 60 leaves are drawn at level 0 and 800 at level 1. A small leaf can simplify sooner: give it a `detailReach` below 1.
- **Flower, fruit, appendage**: as many levels as you make. `detailAt` gives the distances (m) between one level and the next, so it has `lods - 1` entries; `detailCaps` gives how many may be drawn at once at each level but the last.
- A model with one level is drawn with it at every distance.

Every asset states a `budget`: the most triangles it has at each level. The test builds every variant and fails if one is over, or if a budget is over the ceiling for its kind (`BUDGET_CEILING` in `look.ts`):

| | finest (level 0) | between | coarsest (last level) |
|---|---|---|---|
| leaf | 2400 | 400 | 140 |
| flower | 24000 | 6000 | 520 |
| fruit | 4000 | 1000 | 420 |
| appendage | 600 | 200 | 64 |

The coarsest level is what a whole Bower is drawn with: a dome has thousands of leaves and over a thousand inflorescences, nearly all at the last level. Spend triangles at level 0, where a portrait looks, and be strict at the last. A coarse level should keep the silhouette and the mass of colour and drop everything else: fewer segments, no stamens, fewer flowers each drawn larger. Check it in the whole-plant stills, where most organs are at the coarsest level.

## 7. Recipes

**A bark.** Fill in `WoodLook`: `young` (new shoot), `mature` (smooth bark a few seasons old) and `old` (a tint on the grey bark texture) in linear RGB; `woodyDays`, the ages in days over which a shoot turns from `young` to `mature` (how soon it goes woody); `oldDays`, over which mature bark gives way to old; `furrowDays` and `furrow`, when the stem flutes and how deeply (1 is the wisteria trunk, 0 stays round); `stiffDays`, over which it stops swaying; `relief` and `roughness` of the surface; and optionally `grain`, the streaks of the bark texture (many, thin and straight for a stringy bark; few, wide and wandering for a fissured or flaking one). The stem's thickness and age are the data's. Check it in the `stem` portrait, and in the whole plant in winter.

**A second leaf form.** Make a second `LeafAsset` and list it under the name the data gives the form: `leaves: { default: juvenileLeaf, adult: adultLeaf }`. The names are the taxon's own, listed in its growth model, and arrive as `RenderLeaf.form`. A leaf with no form, or a form the look does not have, is drawn with `default` (and the caption says which form was missing). Flowers and fruit have forms in the same way.

**A fruit.** Build the unripe fruit in vertex colours, hanging along -Y (`poise: 'hangs'`) or standing along +Y (`'held'`), with `authoredSize` the length of the fruit itself in model units. `lathe` makes berries and hips; `Surf` anything else; `Merge` puts several on a stalk. State `ripe`, `ripeShade`, `roughness`, `swing`, `detailAt`, `detailCaps` and a `budget`, and list it: `fruits: { default: hip }`. The engine sets fruit only where the growth model says the taxon does; the `fruit` portrait tells you whether a run has any.

**An appendage.** One asset per kind the plant has: `appendages: { tendril: myTendril }`. Author it along +Z, one unit long. `pick(r, holding)` chooses the variant, so a tendril that has hold can be drawn coiled and one that has not, hooked. The kinds are the contract's: `tendril`, `leaf_stalk_coil`, `aerial_roots`, `prickle`. The engine places them only where the growth model gives their spacing and length; until it does, a run has none and the `hold` portrait shows a stem on its support instead. The hand-made test plant (`?plants=fixture`) carries all four kinds.

**A flower.** Decide what one instance is: one `RenderFlower` is one inflorescence where flowers are borne together and one flower where they are single, as the taxon's growth model says. Build it with `Merge(false)`: the stalk and whatever persists as axis, each flower or petal as a part with its pivot and its `t`. Set `authoredSize` to what `lengthM` measures for this taxon.

## 8. Shape numbers from `species/<id>/morphology.json`

A number that describes the real plant does not belong in drawing code. It is entered in `species/<id>/morphology.json` with its evidence status and source (`packages/core/src/morphology.ts` describes the file), and read from there:

```ts
import { characterNumber, parseMorphology } from '@horti/core';
import morphologyJson from '../../../../../species/wisteria-sinensis/morphology.json';

const morphology = parseMorphology(morphologyJson, 'species/wisteria-sinensis/morphology.json');
/** "consisting usually of eleven leaflets" (Bean) */
const USUAL_LEAFLETS = characterNumber(morphology, 'leaf.leafletCount');
const LEAF_VARIANTS = [USUAL_LEAFLETS - 2, USUAL_LEAFLETS, USUAL_LEAFLETS + 2];
```

`characterNumber`, `characterRange`, `characterText` and `characterList` throw, naming the taxon and the key, where the file has no such character or records it as unknown: then enter it in the file with its source, or leave the shape plain. `hasCharacter` asks without throwing. Proportions that only make the model look right (how far a petal curls) are appearance and stay in the module; counts and measured sizes (leaflets, tepals, the length of a leaflet for its width) come from the file. Import only your own taxon's file.

## 9. Portraits

A specimen is one plant of the taxon, grown by the engine on a small standard frame (`examples/specimen-frame.bower.json`: a 150 mm glulam post 3 m tall, a trellis of 40 mm laths at 0.4 m centres, three 5 mm cables) and shown on a date, whole or close on one real organ of the run.

```bash
npm run portrait -- <taxon-id>                    # nine stills and the contact sheet, about a minute
npm run portrait -- <taxon-id> --only flower      # one view again, about ten seconds
npm run portrait -- <taxon-id> --years 3 --care untended
```

It writes `out/portraits/<taxon-id>/<view>-<date>.png` (the whole plant on a day of each season, then `leaf`, `flower`, `fruit`, `stem`, `hold`) and `out/portraits/index.html`, a contact sheet of every taxon that has portraits. Each date is found by asking the run what is on the plant; the reason is printed and is under the picture on the sheet. A view the run has nothing for is skipped with the reason ("this run has no fruit"). The script starts the viewer on port 5197 if it is not running, and leaves it running.

The same pictures by hand, in any browser, with the interface if you leave out `bare=1`:

```
http://localhost:5197/?specimen=<taxon-id>&years=6&date=2032-05-19&view=flower&bare=1
```

`view` is `whole`, `leaf`, `flower`, `fruit`, `stem` or `hold`; `care=untended` leaves the plant untrained; `cam=x,y,z,tx,ty,tz` (three.js frame) puts the camera where you want it; `wind=0.6` turns the wind on. Where a view has nothing to show on that date the page says so across the top, with the days on which it would have, and shows the whole plant. A taxon that cannot be grown, or a module that fails to load, is refused in words on a dark page. The page sets `window.__ready` (and `data-ready` on `<body>`) to `true` when the frame is final, or to `'error'`.

**What to check in a portrait.** Read the PNG files; do not trust that a still exists.

1. *It is the plant.* Against `species/<id>/SPECIES_PROFILE.md` and the morphology file: leaf shape and arrangement, flower form and colour, what the fruit is, the bark. Would a horticulturist name it?
2. *Scale.* The laths are 40 mm wide at 0.4 m centres and the post 150 mm: a leaf the data says is 80 mm long should be two lath-widths long. If an organ looks the wrong size, the model is not one unit long or `authoredSize` is not what `lengthM` measures.
3. *Which way up.* Leaves with their upper side to the sky; hanging things hanging; held flowers facing out or up, not into the timber.
4. *Through time.* Open the flower view on several dates between a flower's bud and its last day (the caption says how far through it is): buds, opening in order, petal fall, what is left after. Leaves at flush, in summer and in autumn colour.
5. *From afar.* In the whole-plant stills nearly every organ is at its coarsest level. It should read as the same plant: same colour mass, same habit.
6. *The caption.* It says what is in the picture and, where the look is the stand-in or a model is missing, says that too. A portrait whose caption says "provisional look" is not finished.

Then run the checks:

```bash
npx tsc -p packages/viewer --noEmit
npx vitest run packages/viewer
```

## 10. Mistakes that are easy to make

- **Putting the plant's numbers in the model.** Leaf length, flowers per plant, flowering dates and stem thickness are the data's. If a still looks wrong because the run gives too few flowers or too short a leaf, the place to look is the growth model, not a constant in the taxon module.
- **Tagging everything as a part.** Whatever is tagged with `t >= 0` vanishes when the flower is spent. A flower built wholly of parts leaves a bare node; one built wholly as axis never opens or sheds. Stalk, calyx, stamens and seed head are axis; petals are parts with pivots where they join.
- **Authoring at the wrong size or in the wrong frame.** A leaf not one unit long, a flower whose `authoredSize` is its length when `lengthM` is its width, a hanging model built along +Y. The tests catch the first and the last; the second shows only in the portrait, as a flower twice too large.
- **Spending the budget at the far level.** A coarsest level of 400 triangles looks fine in a portrait and brings a planted dome to a crawl.
- **Borrowing.** Importing another taxon's module, its morphology file, or the wisteria's palette "for now". The test refuses the first two; the third is a look that does not transfer all the same.
