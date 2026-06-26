/**
 * device-lab — reusable physical-calibration harness.
 *
 * A template-agnostic instrument for designing at true physical size: calibrate
 * the monitor once (credit-card match -> px/mm), define each device by its real
 * millimetre size, and export the settled values. The design under test is
 * supplied by the caller and authored in container-query units; the lab only
 * sizes the screen and exposes the generator knobs.
 */

/**
 * One physical screen on a device. A device has one or more, stacked top to
 * bottom by declaration order. Each screen renders as its own independent
 * surface mount (own route, own local focus); the screens of one device share
 * that device's single state source.
 */
export type ScreenConfig = {
  /** Stable id, unique within the device. */
  readonly id: string
  /** Physical screen width in millimetres. */
  readonly widthMm: number
  /** Physical screen height in millimetres. */
  readonly heightMm: number
  /** Render the device bezel around this screen. Default true; false for a
   * near-bezel-less panel like a TV. */
  readonly bezel?: boolean
  /** Short label shown on the screen (e.g. "Top", "Bottom"). */
  readonly label?: string
  /** Lab slot: "primary" mounts the surface under design; a "secondary" screen
   * renders a placeholder until a real surface is assigned to it. */
  readonly role?: "primary" | "secondary"
}

/** One screen in the device matrix, with its default physical + tuning values. */
export type DeviceConfig = {
  /** Stable id, used as the localStorage namespace for this device. */
  readonly id: string
  /** Human label shown in the calibrator. */
  readonly name: string
  /** Default physical screen width in millimetres. */
  readonly widthMm: number
  /** Default physical screen height in millimetres. */
  readonly heightMm: number
  /** Render the device bezel/frame around the screen. Default true; set false
   * for a near-bezel-less panel like a TV. */
  readonly bezel?: boolean
  /** Physical screens, top to bottom. Omit for a single-screen device (the
   * widthMm/heightMm above describe its one screen). A dual-screen device like
   * Thor lists its main panel plus the smaller one beneath it; each screen
   * mounts independently while sharing the device's state. */
  readonly screens?: readonly ScreenConfig[]
}

/**
 * A global, theme-specific generator knob (e.g. base size, type ratio, space
 * unit). The lab persists its numeric value, renders a slider, and applies it
 * as a CSS custom property on the stage so it cascades into every screen. The
 * theme's CSS reads `var(cssVar, <fallback>)`; it must NOT redeclare cssVar, or
 * the inherited override is lost.
 */
export type ThemeKnob = {
  /** Stable id for persistence + React key. */
  readonly id: string
  /** Short label shown in the calibrator. */
  readonly label: string
  /** CSS custom property the lab sets on the stage (e.g. "--pico-type-ratio"). */
  readonly cssVar: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
  /** Unit suffix appended when applied (e.g. "px", "em"). Omit for a raw number. */
  readonly unit?: string
  /** When set, the slider's max position is treated as infinity: it displays
   * "∞" and writes the CSS keyword `infinity` (e.g. to disable a ceiling). */
  readonly infinityAtMax?: boolean
}
