/**
 * theme-workshop — reusable theme-workshop kit (prototype tooling).
 *
 * A backend-free viewer that renders a theme's screens on the physical-size
 * device lab, with a screen navigator, an atomic catalog, and a slot for
 * theme-specific live controls. The harness (lab + nav + wall + view store) is
 * generic; the skin, the screens, and any extra knobs are the theme's, supplied
 * through a single `ThemeWorkshopConfig`.
 *
 * Skinning rule: every chrome element takes its class name from the config's
 * `classNames` map, falling back to a neutral `wk-*` default. A theme that
 * supplies its own class names keeps full control of its look, so its existing
 * CSS applies unchanged — the kit never imposes pico (or any theme) styling.
 */
import type { ReactNode } from "react"
import type { DeviceConfig, ThemeKnob } from "./device-lab"

export type { DeviceConfig, ThemeKnob } from "./device-lab"

/** One screen in the workshop catalog. Standalone; renders fixture data. */
export interface Screen {
  readonly id: string
  readonly group: string
  readonly name: string
  readonly note?: string
  readonly render: () => ReactNode
}

/** The atomic-design layers. The catalog renders them top-down (page →
 * template → organism → molecule → atom): the whole page first, decomposing into
 * its parts. A `page` is a full screen (always framed). */
export type StoryLayer = "page" | "template" | "organism" | "molecule" | "atom"

/**
 * One component story for the "parts" catalog view — a component (optionally a
 * row of variants) rendered in isolation, tagged with its atomic layer. The
 * workshop renders it inside the theme's own screen scope (so its tokens/skin
 * resolve), with neutral catalog chrome around it. Homegrown; no Storybook.
 */
export interface Story {
  readonly id: string
  /** Stable product-owned part id used to match a clicked rendered part back to
   * its catalog story. Display names may change or collide; this id is the
   * contract. */
  readonly designPartId?: string
  readonly layer: StoryLayer
  readonly name: string
  readonly note?: string
  /** Set for a full-surface component (an overlay/screen that fills its box and
   * collapses if unsized) — the workshop gives it a sized, framed canvas instead
   * of the default bare, content-sized one. Templates are always framed. */
  readonly surface?: boolean
  /** Optional lab-only state tag, e.g. a state-machine tag like "Loading" or
   * "LoadError". Free-form: dev-lab derives the available states for a part from
   * the actual tags its discovered variant family carries — there is no fixed
   * state vocabulary. Used to relate local fixture states without a manifest. */
  readonly state?: string
  /** Optional IDs of related stories from the same discovered module. */
  readonly variants?: readonly string[]
  readonly render: () => ReactNode
}

/**
 * Skin hooks for the generic chrome. Each value is a class name the kit applies
 * to that element; omit one to get the neutral `wk-*` default. State tokens
 * (`on`, `all`, `one`) are appended literally by the kit, so a theme styles e.g.
 * its active map item via `<itsMapItem>.on`.
 */
export interface WorkshopClassNames {
  // Device lab (forwarded to DeviceLab).
  readonly stage?: string
  readonly screens?: string
  readonly bezel?: string
  readonly screen?: string
  // Gallery bar.
  readonly bar?: string
  readonly nav?: string
  readonly tools?: string
  readonly label?: string
  readonly count?: string
  readonly view?: string
  readonly mapToggle?: string
  // Map jump panel.
  readonly mapPanel?: string
  readonly mapHead?: string
  readonly mapBody?: string
  readonly mapGroup?: string
  readonly mapGroupTitle?: string
  readonly mapItem?: string
  // All-screens wall.
  readonly wall?: string
  readonly wallGroup?: string
  readonly wallGroupTitle?: string
  readonly wallGroupCount?: string
  readonly wallGrid?: string
  readonly wallCell?: string
  readonly wallFrame?: string
  readonly wallScreen?: string
  readonly wallHit?: string
  readonly wallLabel?: string
}

/** Navigation cue kinds the Gallery emits so a theme can play sound, etc. */
export type CueKind = "move" | "open" | "back" | "confirm" | "toggle"

/**
 * A declarative live control a theme drops into the gallery bar. The theme
 * provides the knob + behavior (value + handler); the WORKSHOP renders it with
 * neutral `wk-control-*` chrome, so controls look consistent across every theme
 * (the inversion: theme declares, workshop fills the UI). Mirrors how the
 * device-lab already renders generator knobs from `ThemeKnob` data.
 */
export type WorkshopControl =
  | {
      /** A value the theme advances on click (e.g. cycle a list). */
      readonly kind: "cycle"
      readonly id: string
      readonly label?: string
      readonly value: ReactNode
      readonly onClick: () => void
      readonly title?: string
    }
  | {
      readonly kind: "toggle"
      readonly id: string
      readonly label: string
      readonly value: boolean
      readonly onChange: (next: boolean) => void
      readonly title?: string
    }
  | {
      readonly kind: "select"
      readonly id: string
      readonly label?: string
      readonly value: string
      readonly options: readonly {
        readonly value: string
        readonly label?: string
      }[]
      readonly onChange: (next: string) => void
      readonly title?: string
    }
  | {
      /** Escape hatch for a bespoke widget the kinds above can't express. */
      readonly kind: "custom"
      readonly id: string
      readonly render: () => ReactNode
    }

/** Everything a theme contributes to mount the workshop. */
export interface ThemeWorkshopConfig {
  /** Stable id; used as the device-lab localStorage namespace and root attr. */
  readonly id: string
  /** Device roster for the lab. */
  readonly devices: readonly DeviceConfig[]
  /** Generator knobs (base size, ratio, space, …) cascaded onto the stage. */
  readonly knobs?: readonly ThemeKnob[]
  readonly defaultPxPerMm?: number
  /** The screen catalog + group display order. */
  readonly screens: readonly Screen[]
  readonly groups: readonly string[]
  /** Component catalog for the "parts" view (pages → atoms — the screens are the
   * pages). When present, the gallery offers it alongside the single-screen lab. */
  readonly stories?: readonly Story[]
  /** Per-element skin class names; omitted slots fall back to neutral `wk-*`. */
  readonly classNames?: WorkshopClassNames
  /** Extra attributes merged onto the root wrapper (e.g. `{ "data-pico": true }`
   * so a theme's attribute-scoped CSS variables resolve for the chrome). */
  readonly rootProps?: Record<string, unknown>
  /** Declarative live controls the workshop renders neutrally in the gallery bar
   * (after MAP). A hook — the kit calls it inside the bar — so control `value`s
   * can read the theme's reactive state. Preferred over `workshopControls`. */
  readonly controls?: () => readonly WorkshopControl[]
  /** @deprecated Escape hatch: a fully-built, theme-styled controls node. Prefer
   * `controls` (declarative + neutral chrome). Rendered after `controls`. */
  readonly workshopControls?: ReactNode
  /** Called on each navigation cue; a theme can play SFX here (kit stays silent). */
  readonly onCue?: (kind: CueKind) => void
  /** Side-effect import of the theme's CSS, called once on mount. */
  readonly loadStyles?: () => void
}
