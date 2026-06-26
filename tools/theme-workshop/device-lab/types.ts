/**
 * device-lab — reusable physical-calibration harness.
 *
 * A template-agnostic instrument for designing at true physical size: calibrate
 * the monitor once (credit-card match -> px/mm), define each device by its real
 * millimetre size, and export the settled values. The design under test is
 * supplied by the caller and authored in container-query units; the lab only
 * sizes the screen and exposes the generator knobs.
 */

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
}
