import * as Atom from "effect/unstable/reactivity/Atom"

export const SHIFT_NETWORK_STATUS_TAGS = ["Connected", "Disconnected"] as const

export type ShiftNetworkStatus = (typeof SHIFT_NETWORK_STATUS_TAGS)[number]

export const DEFAULT_SHIFT_NETWORK_STATUS =
  "Connected" satisfies ShiftNetworkStatus

export const shiftNetworkStatusAtom = Atom.make(
  DEFAULT_SHIFT_NETWORK_STATUS as ShiftNetworkStatus,
)

export function shiftNetworkStatusForValue(
  value: string | undefined,
): ShiftNetworkStatus {
  return SHIFT_NETWORK_STATUS_TAGS.includes(value as ShiftNetworkStatus)
    ? (value as ShiftNetworkStatus)
    : DEFAULT_SHIFT_NETWORK_STATUS
}
