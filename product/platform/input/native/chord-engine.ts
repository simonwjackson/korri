import { EV_KEY } from "./button-codes"
import type { NativeInputDeviceClass } from "./discover-devices"

export interface ButtonChordDefinition<Id extends string = string> {
  readonly id: Id
  readonly requiredCodes: readonly number[]
  readonly exact?: boolean
  readonly deviceClass?: NativeInputDeviceClass
}

export interface ButtonChordInputEvent {
  readonly deviceId: string
  readonly deviceClass?: NativeInputDeviceClass
  readonly type?: number
  readonly code: number
  readonly value: number
}

export interface ButtonChordMatch<Id extends string = string> {
  readonly id: Id
  readonly deviceId: string
}

export interface ButtonChordEngine<Id extends string = string> {
  handleEvent: (event: ButtonChordInputEvent) => readonly ButtonChordMatch<Id>[]
  clearDevice: (deviceId: string) => void
  reset: () => void
}

interface DeviceState {
  readonly pressed: Set<number>
  readonly firedChordIds: Set<string>
  readonly blockedChordIds: Set<string>
}

export function createButtonChordEngine<const Id extends string>(options: {
  readonly chords: readonly ButtonChordDefinition<Id>[]
}): ButtonChordEngine<Id> {
  const devices = new Map<string, DeviceState>()
  const relevantCodes = new Set(
    options.chords.flatMap(chord => [...chord.requiredCodes]),
  )

  function deviceState(deviceId: string): DeviceState {
    const current = devices.get(deviceId)
    if (current) return current

    const next = {
      pressed: new Set<number>(),
      firedChordIds: new Set<string>(),
      blockedChordIds: new Set<string>(),
    }
    devices.set(deviceId, next)
    return next
  }

  return {
    handleEvent(event) {
      if (event.type !== undefined && event.type !== EV_KEY) return []

      const state = deviceState(event.deviceId)
      const wasPressed = state.pressed.has(event.code)
      const isPressed = event.value !== 0
      const transitionedDown = isPressed && !wasPressed
      const transitionedUp = !isPressed && wasPressed

      if (transitionedDown) state.pressed.add(event.code)
      if (transitionedUp) state.pressed.delete(event.code)

      if (!relevantCodes.has(event.code)) return []

      if (transitionedUp) {
        for (const chord of options.chords) {
          if (chord.requiredCodes.includes(event.code)) {
            state.firedChordIds.delete(chord.id)
            state.blockedChordIds.delete(chord.id)
          }
        }
        return []
      }

      if (!transitionedDown) return []

      const matches: ButtonChordMatch<Id>[] = []

      for (const chord of options.chords) {
        if (chord.deviceClass && chord.deviceClass !== event.deviceClass) {
          continue
        }
        if (!chord.requiredCodes.includes(event.code)) continue
        if (state.firedChordIds.has(chord.id)) continue
        if (state.blockedChordIds.has(chord.id)) continue

        const hasRequired = chord.requiredCodes.every(code =>
          state.pressed.has(code),
        )
        if (!hasRequired) continue

        if (chord.exact && state.pressed.size !== chord.requiredCodes.length) {
          state.blockedChordIds.add(chord.id)
          continue
        }

        state.firedChordIds.add(chord.id)
        matches.push({ id: chord.id, deviceId: event.deviceId })
      }

      return matches
    },
    clearDevice(deviceId) {
      devices.delete(deviceId)
    },
    reset() {
      devices.clear()
    },
  }
}
