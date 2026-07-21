/**
 * Map InputPlumber DBus-target capability events (`ui_*`) into the synthetic
 * evdev events the system shortcut engine already understands.
 *
 * A′ routes the shortcut-relevant gamepad buttons through InputPlumber's DBus
 * target, which is a plain D-Bus signal channel — nothing a foreground game can
 * `EVIOCGRAB`. inputd feeds these to the same `createSystemShortcutEngine`
 * instance as raw evdev, so the chord logic (Home+L1/R1, etc.) is unchanged; it
 * just no longer depends on reading the grabbable virtual pad.
 *
 * Only the capabilities that participate in a shortcut chord are mapped;
 * everything else (face buttons, quick-access, screenshot, triggers, mute,
 * touch) returns null so it never perturbs shortcut state.
 */
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  BTN_BACK,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_TL,
  BTN_TR,
  BTN_X,
  EV_ABS,
  EV_KEY,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
} from "@platform/input/native/button-codes"

export interface ShortcutEvdevEvent {
  readonly type: number
  readonly code: number
  readonly value: number
}

/** A DBus capability value at/above this counts as "pressed". */
const PRESS_THRESHOLD = 0.5

const KEY_CAPABILITY_CODES: Readonly<Record<string, number>> = {
  ui_guide: BTN_MODE,
  ui_l1: BTN_TL,
  ui_r1: BTN_TR,
  ui_l3: BTN_THUMBL,
  ui_r3: BTN_THUMBR,
  ui_option: BTN_START,
  ui_select: BTN_SELECT,
  ui_back: BTN_BACK,
  ui_osk: BTN_X,
  ui_volume_up: KEY_VOLUMEUP,
  ui_volume_down: KEY_VOLUMEDOWN,
}

// D-pad capabilities map onto the two hat axes; the sign encodes the direction
// and a released event returns the axis to center (matching evdev ABS_HAT0*).
const HAT_CAPABILITIES: Readonly<
  Record<string, { readonly code: number; readonly direction: number }>
> = {
  ui_up: { code: ABS_HAT0Y, direction: -1 },
  ui_down: { code: ABS_HAT0Y, direction: 1 },
  ui_left: { code: ABS_HAT0X, direction: -1 },
  ui_right: { code: ABS_HAT0X, direction: 1 },
}

export function dbusCapabilityToShortcutEvent(
  capability: string,
  value: number,
): ShortcutEvdevEvent | null {
  const pressed = value >= PRESS_THRESHOLD

  const keyCode = KEY_CAPABILITY_CODES[capability]
  if (keyCode !== undefined) {
    return { type: EV_KEY, code: keyCode, value: pressed ? 1 : 0 }
  }

  const hat = HAT_CAPABILITIES[capability]
  if (hat) {
    return { type: EV_ABS, code: hat.code, value: pressed ? hat.direction : 0 }
  }

  return null
}
