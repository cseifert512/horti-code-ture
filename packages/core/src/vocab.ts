/**
 * Canonical vocabularies for the whole project.
 *
 * The specification documents were written separately and use overlapping but
 * different word lists for the same ideas (three for evidence status, two for
 * bud states). This file is the single source of truth; the `*_DOC_TERMS`
 * tables record how every term used in the documents maps on to it, and the
 * tests fail if a document term is left unmapped.
 */

// ---------------------------------------------------------------------------
// Evidence status: how far a value can be trusted.
// SIMULATION_KEY.md section 3 is the base list; `design_target` and
// `site_dependent` come from README.md "Working rules for agents".
// ---------------------------------------------------------------------------
export const EVIDENCE_STATUS = [
  /** Observed on a Bower prototype, nursery trial or monitored plant, with method and uncertainty. */
  'measured',
  /** Taken from a peer-reviewed study; applicability to this taxon and context must be stated. */
  'peer_reviewed',
  /** RHS or flora description: an observational envelope, never a growth coefficient. */
  'published_plant_profile',
  /** Fitted by this project to measured observations. */
  'calibrated',
  /** A number chosen so the model can run. Must be visible in every report that depends on it. */
  'provisional_design_assumption',
  /** A Bower design intention (for example the winter-evergreen share), not a biological fact. */
  'design_target',
  /** Cannot be fixed in the taxon library: decided per site. */
  'site_dependent',
  /** No value. The model must cope with its absence rather than invent one. */
  'unknown',
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

/** Statuses that assert something about the real world and therefore need a citation. */
export const EVIDENCE_NEEDS_SOURCE: readonly EvidenceStatus[] = ['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated'];
/** Statuses that are choices and therefore need a stated reason. */
export const EVIDENCE_NEEDS_BASIS: readonly EvidenceStatus[] = ['provisional_design_assumption', 'design_target'];
/** Statuses that may legitimately carry no value. */
export const EVIDENCE_MAY_BE_EMPTY: readonly EvidenceStatus[] = ['unknown', 'site_dependent'];

/** Every evidence term used in the documents, mapped to the canonical statuses it can mean. */
export const EVIDENCE_DOC_TERMS: Readonly<Record<string, readonly EvidenceStatus[]>> = {
  // SIMULATION_KEY.md section 3
  measured: ['measured'],
  published_plant_profile: ['published_plant_profile'],
  peer_reviewed: ['peer_reviewed'],
  calibrated: ['calibrated'],
  provisional_design_assumption: ['provisional_design_assumption'],
  unknown: ['unknown'],
  // SOURCES_AND_ASSUMPTIONS.md provenance template
  published: ['published_plant_profile', 'peer_reviewed'],
  'model assumption': ['provisional_design_assumption'],
  // README.md working rules
  evidence: ['measured', 'peer_reviewed', 'published_plant_profile', 'calibrated'],
  'design target': ['design_target'],
  'unresolved question': ['unknown'],
  'site-dependent decision': ['site_dependent'],
};

// ---------------------------------------------------------------------------
// Attachment: CONSTRAINTS_AND_PHENOLOGY.md section 2
// ---------------------------------------------------------------------------
export const ATTACHMENT_MECHANISM = ['stem_twining', 'petiole_twining', 'tendril', 'aerial_root', 'scramble_and_tie', 'none'] as const;
export type AttachmentMechanism = (typeof ATTACHMENT_MECHANISM)[number];

/**
 * Small parts a plant holds on or defends itself with, drawn by a viewer where
 * the engine says they are. `tendril`: a coiling organ opposite a leaf (vine).
 * `leaf_stalk_coil`: a leaf stalk wound round a support (clematis).
 * `aerial_roots`: a patch of clinging rootlets on the side of a stem that
 * touches a surface (ivy, climbing hydrangea, trumpet vine). `prickle`: a
 * thorn of the bark that hooks a scrambler on to its neighbours (rose).
 */
export const APPENDAGE_KIND = ['tendril', 'leaf_stalk_coil', 'aerial_roots', 'prickle'] as const;
export type AppendageKind = (typeof APPENDAGE_KIND)[number];

/**
 * How an inflorescence or a fruit is held from where it is attached.
 * `hanging`: it droops under its own weight (a wisteria raceme, a pod).
 * `facing_out`: it faces away from the support, or carries on the line of the
 * short shoot it ends (a clematis flower, a rose at the end of its side shoot).
 * `upright`: it stands above the shoot that bears it.
 */
export const ORGAN_HELD = ['hanging', 'facing_out', 'upright'] as const;
export type OrganHeld = (typeof ORGAN_HELD)[number];

export const ATTACHMENT_STATUS = ['searching', 'contacted', 'grasped', 'trained_by_human', 'stable', 'detached', 'failed', 'prohibited'] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUS)[number];

/**
 * How a shoot that is not on a support stands, which its own weight decides
 * (`sim/free-shoot.ts`). No specification document names these states; they
 * are the three that the published work on searcher shoots tells apart.
 *   self_supporting  it holds its tip at or above the level, and steers it
 *                    towards up and the light
 *   pendulous        its weight has turned its tip below the level although
 *                    its growth points it above: it no longer steers, and
 *                    grows on as it hangs
 *   plumb            it hangs straight down
 */
export const SHOOT_POSTURE = ['self_supporting', 'pendulous', 'plumb'] as const;
export type ShootPosture = (typeof SHOOT_POSTURE)[number];

/**
 * Twining handedness, stated as the chirality of the helix the stem forms.
 * Chirality is intrinsic: it does not depend on the viewpoint or on which way
 * along the stem one travels, which is why it is used here instead of
 * "clockwise" / "anticlockwise".
 *
 *   right_handed  like an ordinary screw thread (Z-twist). A stem climbing a
 *                 vertical pole turns ANTICLOCKWISE when seen from above,
 *                 looking down on the growing tip. In a right-handed
 *                 coordinate system with z up: (cos t, sin t, c t), c > 0.
 *   left_handed   the mirror image (S-twist): CLOCKWISE seen from above.
 */
export const HANDEDNESS = ['right_handed', 'left_handed'] as const;
export type Handedness = (typeof HANDEDNESS)[number];

/**
 * Whether a manufactured surface may be touched by a plant. Everything is
 * `permitted` by default: the timber is the growing surface. `prohibited` and
 * `tie_only` exist so a project can declare an exclusion (a connection that
 * must stay visible, an access hatch).
 */
export const CONTACT_PERMISSION = ['prohibited', 'tie_only', 'permitted'] as const;
export type ContactPermission = (typeof CONTACT_PERMISSION)[number];

/**
 * How much of the structure a timber member is. KEY.md section 5.
 *   primary      the curved glulam beams that carry the building
 *   sub_lattice  lighter timber members and laths between them, there to
 *                refine the growing surface to the scale plants need
 */
export const MEMBER_TIER = ['primary', 'sub_lattice'] as const;
export type MemberTier = (typeof MEMBER_TIER)[number];

/**
 * The steel and fixings of the sub-lattice. Deliberately short: steel appears
 * only as slender cables where timber cannot give a plant a hold, and as tie
 * points. There are no steel rods, rails or frames in a Bower.
 */
export const SUPPORT_KIND = ['cable', 'tie_point'] as const;
export type SupportKind = (typeof SUPPORT_KIND)[number];

/** What a stretch of plant route is made of. */
export const ROUTE_MATERIAL = ['timber', ...SUPPORT_KIND] as const;
export type RouteMaterial = (typeof ROUTE_MATERIAL)[number];

// ---------------------------------------------------------------------------
// Plant habit
// ---------------------------------------------------------------------------
export const LIFE_FORM = ['woody_climber', 'herbaceous_climber', 'shrub'] as const;
export type LifeForm = (typeof LIFE_FORM)[number];

export const LEAF_HABIT = ['deciduous', 'semi_evergreen', 'evergreen'] as const;
export type LeafHabit = (typeof LEAF_HABIT)[number];

/** How the plant is kept in the UK baseline: Thunbergia alata is perennial in warmth but replanted yearly. */
export const UK_CULTIVATION = ['perennial', 'annual_replant'] as const;
export type UkCultivation = (typeof UK_CULTIVATION)[number];

/**
 * Which of the plant's OWN shoots carry its flowers. "Wood" always means the
 * plant's stems, never the manufactured timber of the Bower.
 */
export const FLOWERING_WOOD = [
  /** Buds formed last season on shoots or spurs that must survive winter and pruning. */
  'previous_season',
  /** Flowers form on shoots grown in the same season. */
  'current_season',
  /** A first flush on older wood and a later one on new growth. */
  'both',
] as const;
export type FloweringWood = (typeof FLOWERING_WOOD)[number];

// ---------------------------------------------------------------------------
// Buds. The two documents list different single-word "bud states" that mix
// three independent things. They are separated here:
//   fate   what the bud will become
//   stage  how far along it is
//   end    why it stopped, if it did
// A dormant bud must still know whether it is floral, which a single state
// word cannot express.
// ---------------------------------------------------------------------------
export const BUD_FATE = ['undetermined', 'vegetative', 'floral'] as const;
export type BudFate = (typeof BUD_FATE)[number];

export const BUD_STAGE = ['initiated', 'dormant', 'developing', 'open', 'spent'] as const;
export type BudStage = (typeof BUD_STAGE)[number];

export const BUD_END = ['aborted', 'removed_by_pruning'] as const;
export type BudEnd = (typeof BUD_END)[number];

export interface BudStateMapping {
  fate?: BudFate;
  stage?: BudStage;
  end?: BudEnd;
  /** Set when the document term is not a bud state at all. */
  note?: string;
}

/** Every bud term used in the documents, mapped to the canonical triple. */
export const BUD_DOC_TERMS: Readonly<Record<string, BudStateMapping>> = {
  // CONSTRAINTS_AND_PHENOLOGY.md section 3 "Minimum bud states"
  undifferentiated: { fate: 'undetermined', stage: 'initiated' },
  vegetative: { fate: 'vegetative' },
  floral_induction: { fate: 'floral', stage: 'initiated' },
  floral_bud: { fate: 'floral', stage: 'initiated' },
  'dormant/overwintering': { stage: 'dormant' },
  developing: { stage: 'developing' },
  open: { stage: 'open' },
  senescent: { stage: 'spent' },
  aborted: { end: 'aborted' },
  removed_by_pruning: { end: 'removed_by_pruning' },
  // SIMULATION_KEY.md section 2 "Bud"
  competent: { note: 'Floral competence belongs to the bearing axis and plant (age, maturity), not to a bud.' },
  initiated_floral: { fate: 'floral', stage: 'initiated' },
  dormant: { stage: 'dormant' },
  spent: { stage: 'spent' },
};

// ---------------------------------------------------------------------------
// Gardener events: HORTICULTURAL_INTERVENTIONS.md section 2
// ---------------------------------------------------------------------------
export const GARDENER_EVENT = [
  'plant',
  'train_leader',
  'tie_in',
  'untie_or_reposition',
  'spur_prune',
  'hard_prune',
  'thin_canopy',
  'deadhead_or_select_flowers',
  'water',
  'feed_or_mulch',
  'remove_problem_growth',
  'annual_replant',
  'monitor',
  'replace_failed_perennial',
] as const;
export type GardenerEventType = (typeof GARDENER_EVENT)[number];

// ---------------------------------------------------------------------------
// Qualitative relationships between taxa: KEY.md section 3
// ---------------------------------------------------------------------------
export const RELATIONSHIP = ['complementary', 'competes_for_light', 'competes_for_root_resources', 'attachment_conflict', 'maintenance_conflict', 'seasonal_relay'] as const;
export type Relationship = (typeof RELATIONSHIP)[number];

/** Default standing of a taxon in the reference UK palette: KEY.md section 2, last column. */
export const PALETTE_STANDING = ['primary', 'core', 'conditional', 'optional', 'annual', 'ground_companion'] as const;
export type PaletteStanding = (typeof PALETTE_STANDING)[number];

/** RHS hardiness ratings. An approximate UK survival range, not a leaf-retention or flowering score. */
export const RHS_HARDINESS = ['H1a', 'H1b', 'H1c', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7'] as const;
export type RhsHardiness = (typeof RHS_HARDINESS)[number];
