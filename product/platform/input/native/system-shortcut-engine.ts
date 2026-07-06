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
  BTN_Y,
  EV_ABS,
  EV_KEY,
  KEY_BACK,
  KEY_RECORD,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
} from "./button-codes"
import type { NativeInputDeviceClass } from "./discover-devices"

export type SystemShortcutControl =
  | "home"
  | "l1"
  | "r1"
  | "start"
  | "select"
  | "l3"
  | "r3"
  | "back"
  | "x"
  | "volume-up"
  | "volume-down"
  | "dpad-up"
  | "dpad-down"
  | "dpad-left"
  | "dpad-right"

export interface SystemShortcutDefinition<Id extends string = string> {
  readonly id: Id
  readonly requiredControls: readonly SystemShortcutControl[]
  readonly exact?: boolean
}

export interface SystemTapDefinition<Id extends string = string> {
  readonly id: Id
  readonly control: SystemShortcutControl
}

export interface SystemShortcutInputEvent {
  readonly deviceId: string
  readonly deviceClass?: NativeInputDeviceClass
  readonly type: number
  readonly code: number
  readonly value: number
}

export interface SystemShortcutMatch<Id extends string = string> {
  readonly id: Id
}

export interface SystemShortcutEngine<Id extends string = string> {
  handleEvent: (
    event: SystemShortcutInputEvent,
  ) => readonly SystemShortcutMatch<Id>[]
  clearDevice: (deviceId: string) => void
  isPressed: (control: SystemShortcutControl) => boolean
  reset: () => void
}

type ControlTransition = {
  readonly control: SystemShortcutControl
  readonly pressed: boolean
}

type AxisState = {
  readonly x?: SystemShortcutControl
  readonly y?: SystemShortcutControl
}

interface DeviceState {
  readonly pressed: Set<SystemShortcutControl>
  axes: AxisState
}

export function createSystemShortcutEngine<const Id extends string>(options: {
  readonly shortcuts: readonly SystemShortcutDefinition<Id>[]
  readonly taps?: readonly SystemTapDefinition<Id>[]
}): SystemShortcutEngine<Id> {
  const devices = new Map<string, DeviceState>()
  const firedShortcutIds = new Set<Id>()
  const consumedTapControls = new Set<SystemShortcutControl>()

  function deviceState(deviceId: string): DeviceState {
    const current = devices.get(deviceId)
    if (current) return current
    const next = { pressed: new Set<SystemShortcutControl>(), axes: {} }
    devices.set(deviceId, next)
    return next
  }

  function activeControls(): Set<SystemShortcutControl> {
    const active = new Set<SystemShortcutControl>()
    for (const state of devices.values()) {
      for (const control of state.pressed) active.add(control)
    }
    return active
  }

  function hasControl(control: SystemShortcutControl): boolean {
    for (const state of devices.values()) {
      if (state.pressed.has(control)) return true
    }
    return false
  }

  function releaseShortcutStateFor(control: SystemShortcutControl) {
    for (const shortcut of options.shortcuts) {
      if (!shortcut.requiredControls.includes(control)) continue
      firedShortcutIds.delete(shortcut.id)
    }
  }

  function clearDevice(deviceId: string) {
    const current = devices.get(deviceId)
    devices.delete(deviceId)
    if (!current) return
    for (const control of current.pressed) releaseShortcutStateFor(control)
  }

  function handleTransition(
    transition: ControlTransition,
    event: SystemShortcutInputEvent,
  ): readonly SystemShortcutMatch<Id>[] {
    const state = deviceState(event.deviceId)
    const wasPressed = state.pressed.has(transition.control)
    const matches: SystemShortcutMatch<Id>[] = []

    if (transition.pressed) {
      if (wasPressed) return matches
      state.pressed.add(transition.control)
    } else {
      if (!wasPressed) return matches
      state.pressed.delete(transition.control)
      releaseShortcutStateFor(transition.control)

      for (const tap of options.taps ?? []) {
        if (tap.control !== transition.control) continue
        if (consumedTapControls.has(transition.control)) continue
        matches.push({ id: tap.id })
      }
      consumedTapControls.delete(transition.control)
      return matches
    }

    const active = activeControls()
    for (const shortcut of options.shortcuts) {
      if (!shortcut.requiredControls.includes(transition.control)) continue
      if (firedShortcutIds.has(shortcut.id)) continue
      if (!shortcut.requiredControls.every(control => active.has(control))) {
        continue
      }
      if (shortcut.exact && active.size !== shortcut.requiredControls.length) {
        continue
      }

      firedShortcutIds.add(shortcut.id)
      for (const control of shortcut.requiredControls) {
        consumedTapControls.add(control)
      }
      matches.push({ id: shortcut.id })
    }

    return matches
  }

  return {
    handleEvent(event) {
      return transitionsForEvent(event, deviceState(event.deviceId)).flatMap(
        transition => [...handleTransition(transition, event)],
      )
    },
    clearDevice,
    isPressed: hasControl,
    reset() {
      devices.clear()
      firedShortcutIds.clear()
      consumedTapControls.clear()
    },
  }
}

function transitionsForEvent(
  event: SystemShortcutInputEvent,
  state: DeviceState,
): readonly ControlTransition[] {
  if (event.type === EV_KEY) {
    const control = controlForKeyCode(event.code)
    if (!control) return []
    return [{ control, pressed: event.value !== 0 }]
  }

  if (event.type === EV_ABS && event.code === ABS_HAT0X) {
    return axisTransitions(state, "x", dpadHorizontal(event.value))
  }

  if (event.type === EV_ABS && event.code === ABS_HAT0Y) {
    return axisTransitions(state, "y", dpadVertical(event.value))
  }

  return []
}

function axisTransitions(
  state: DeviceState,
  axis: keyof AxisState,
  next: SystemShortcutControl | undefined,
): readonly ControlTransition[] {
  const previous = state.axes[axis]
  if (previous === next) return []

  state.axes = { ...state.axes, [axis]: next }
  return [
    ...(previous ? [{ control: previous, pressed: false }] : []),
    ...(next ? [{ control: next, pressed: true }] : []),
  ]
}

function dpadHorizontal(value: number): SystemShortcutControl | undefined {
  if (value < 0) return "dpad-left"
  if (value > 0) return "dpad-right"
  return undefined
}

function dpadVertical(value: number): SystemShortcutControl | undefined {
  if (value < 0) return "dpad-up"
  if (value > 0) return "dpad-down"
  return undefined
}

function controlForKeyCode(code: number): SystemShortcutControl | null {
  if (code === BTN_MODE) return "home"
  if (code === BTN_TL) return "l1"
  if (code === BTN_TR) return "r1"
  if (code === BTN_START) return "start"
  if (code === BTN_SELECT) return "select"
  if (code === BTN_THUMBL) return "l3"
  if (code === BTN_THUMBR) return "r3"
  if (code === BTN_BACK || code === KEY_BACK || code === KEY_RECORD) {
    return "back"
  }
  if (code === BTN_X || code === BTN_Y) return "x"
  if (code === KEY_VOLUMEUP) return "volume-up"
  if (code === KEY_VOLUMEDOWN) return "volume-down"
  return null
}
