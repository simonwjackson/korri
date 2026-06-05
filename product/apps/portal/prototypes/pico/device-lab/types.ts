/**
 * device-lab — reusable physical-calibration harness.
 *
 * A template-agnostic instrument for designing at true physical size: calibrate
 * the monitor once (credit-card match -> px/mm), define each device by its real
 * millimetre size, then tune per-device TEXT / PAD multipliers and export the
 * settled values. The design under test is supplied by the caller and authored
 * in container-query units; the lab only sizes the screen and exposes knobs.
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
  /** Default in-screen font multiplier, as a percentage (100 = 1x). */
  readonly textPct: number
  /** Default container-padding multiplier, as a percentage (100 = 1x). */
  readonly padPct: number
}
