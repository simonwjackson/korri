/** Canned data for the colocated Spotlight prototype. Everything here is fake so
 * the design can be *felt* before any real part, lab state, or model is wired
 * in. */

export type LabConceptDensity = "airy" | "cozy" | "tight"

export interface LabConceptVariant {
  readonly id: string
  readonly name: string
  readonly note: string
  readonly density: LabConceptDensity
  readonly clock: string
  readonly battery: number
  readonly charging: boolean
  readonly online: boolean
}

/** Enough canned takes to support the largest variant count. Generation slices
 * the first N of these. */
export const LAB_CONCEPT_VARIANTS: readonly LabConceptVariant[] = [
  {
    id: "airy",
    name: "Airy calm",
    note: "Loosens spacing and lets the title breathe.",
    density: "airy",
    clock: "9:41",
    battery: 82,
    charging: false,
    online: true,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    note: "Evening mood, mid-session, a touch tighter.",
    density: "cozy",
    clock: "20:15",
    battery: 64,
    charging: true,
    online: true,
  },
  {
    id: "stress",
    name: "Stress case",
    note: "Low battery, offline, late — does it still hold?",
    density: "tight",
    clock: "23:58",
    battery: 18,
    charging: false,
    online: false,
  },
  {
    id: "focused",
    name: "Focused",
    note: "Cozy density, midday, steady state.",
    density: "cozy",
    clock: "13:02",
    battery: 47,
    charging: false,
    online: true,
  },
  {
    id: "playful",
    name: "Playful",
    note: "Airy and bright, freshly charged.",
    density: "airy",
    clock: "7:20",
    battery: 96,
    charging: true,
    online: true,
  },
]

/** Bounds for how many takes generation may produce. */
export const LAB_CONCEPT_MIN_COUNT = 2
export const LAB_CONCEPT_MAX_COUNT = LAB_CONCEPT_VARIANTS.length

/** A canned "transcript" the mic button drops in, standing in for real speech
 * capture until it's wired up. */
export const LAB_CONCEPT_DICTATION =
  "make it calmer and more premium, less busy at a glance"

export const LAB_CONCEPT_TARGET = {
  layer: "molecule",
  name: "Status Bar",
} as const
