/**
 * The numbers the light model assumes, each with its evidence status.
 *
 * Two of them are published definitions: the hours of direct sun by which the
 * RHS tells full sun from shade, which are the words the taxon profiles use.
 * Everything else is a choice made so that the model can run, and says so.
 * None has been measured on a Bower or on any of these plants.
 */
import type { Sourced } from '../provenance.ts';
import type { SunClass } from '../vocab.ts';

const RHS_SHADE = 'https://www.rhs.org.uk/garden-design/shade-gardening';

export const LIGHT_MODEL = {
  /** RHS: full sun is "more than six hours of direct sun per day at midsummer". */
  fullSunHours: { value: 6, unit: 'hours of direct sun a day at midsummer', status: 'published_plant_profile', source: RHS_SHADE } as Sourced<number>,
  /** RHS: partial or semi-shade is "three to six hours of direct sun per day at midsummer". */
  partialShadeHours: { value: 3, unit: 'hours of direct sun a day at midsummer', status: 'published_plant_profile', source: RHS_SHADE } as Sourced<number>,
  /** RHS: moderate shade is "two or three hours of direct sunlight each day at midsummer"; deep shade is less than two. */
  moderateShadeHours: { value: 2, unit: 'hours of direct sun a day at midsummer', status: 'published_plant_profile', source: RHS_SHADE } as Sourced<number>,

  /** How much of the light a plant lives on comes from the whole sky and not straight from the sun. */
  diffuseShare: {
    value: 0.55,
    unit: 'share of the light at an open site',
    status: 'provisional_design_assumption',
    basis: 'Under the cloud of southern England about half of the year\'s solar radiation, or a little more, arrives from the sky and not as direct beam. A round figure for that climate; a real site should give its own.',
    range: [0.45, 0.65],
  } as Sourced<number>,

  /** Where light is read: this far off the face of the member a route lies on, where the leaves are. */
  standOffM: {
    value: 0.15,
    unit: 'm',
    status: 'provisional_design_assumption',
    basis: 'Leaves stand a leaf\'s length or so off the stem they grow from, and the growth models give leaves of 0.05 to 0.25 m. Light is read there and not on the timber itself, which would count the member a plant grows on as shading all of it.',
    range: [0.05, 0.3],
  } as Sourced<number>,

  /** Where light is read for a plant that holds no route yet: this far above its root station. */
  stationHeightM: {
    value: 0.5,
    unit: 'm',
    status: 'provisional_design_assumption',
    basis: 'About the top of the cane a plant arrives as. A sampling height, chosen so that a newly planted station has a reading.',
    range: [0.2, 1],
  } as Sourced<number>,

  /** Share of a leaf's area that stands in the way of light from any one direction. */
  leafProjection: {
    value: 0.5,
    status: 'provisional_design_assumption',
    basis: 'Leaves facing every way alike, the neutral assumption of canopy light models, for which half the leaf area is in the way from any direction. Not measured for any of these plants, several of which hold their leaves in a plane.',
    range: [0.3, 0.9],
  } as Sourced<number>,

  /**
   * The share of an open site's light at which a plant's growth stops being
   * held back by light, by the shadiest place its profile accepts. Below it,
   * growth is taken to fall in proportion.
   */
  lightNeeded: {
    full_sun: {
      value: 1,
      unit: 'share of the light at an open site',
      status: 'provisional_design_assumption',
      basis: 'A plant whose profile accepts nothing but full sun is taken to use all the light an open site gives: in the light climate of the UK such a plant is short of light for most of the year, so what shades it slows it by as much. A reading of the profile\'s words, not a measurement.',
      range: [0.6, 1],
    },
    partial_shade: {
      value: 0.4,
      unit: 'share of the light at an open site',
      status: 'provisional_design_assumption',
      basis: 'About the light of a place at the shady end of the RHS\'s partial shade: three hours of direct sun at midsummer and a sky half open. A plant whose profile accepts partial shade is taken to grow unchecked down to that.',
      range: [0.3, 0.6],
    },
    moderate_shade: {
      value: 0.15,
      unit: 'share of the light at an open site',
      status: 'provisional_design_assumption',
      basis: 'About the light of a place with no direct sun and a quarter of the sky open. A plant whose profile accepts shade is taken to grow unchecked down to that.',
      range: [0.05, 0.3],
    },
    deep_shade: {
      value: 0.15,
      unit: 'share of the light at an open site',
      status: 'provisional_design_assumption',
      basis: 'The same as for moderate shade: the profiles do not tell the two apart.',
      range: [0.05, 0.3],
    },
  } as Record<SunClass, Sourced<number>>,

  /** The light at which flowering stops being held back, for the plants whose profiles tie their flowers to sun. */
  floweringLightNeeded: {
    value: 1,
    unit: 'share of the light at an open site',
    status: 'provisional_design_assumption',
    basis: 'Where a profile says that sun matters for flowering, the chance of a flower bud forming is taken to fall in proportion to the light lost. The profiles give the direction and no amount.',
    range: [0.6, 1],
  } as Sourced<number>,
} as const;
