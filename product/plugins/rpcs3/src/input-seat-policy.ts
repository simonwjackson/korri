import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import { inputSeatNameForSlot } from "@platform/input-seat/device-identity"
import {
  INPUT_SEAT_PROVIDER_ID,
  resolveInputSeatPolicy,
} from "@platform/input-seat/policy"
import type {
  Rpcs3DerivedSeatDefaults,
  Rpcs3InputPlayer,
  Rpcs3InputPolicy,
} from "./input-policy"

export const deriveRpcs3InputPolicyFromInputSeats = (
  launchCompanions: LaunchCompanionMap | undefined,
  defaults?: Rpcs3DerivedSeatDefaults,
): Rpcs3InputPolicy | undefined => {
  const rawPolicy = launchCompanions?.[INPUT_SEAT_PROVIDER_ID]
  if (rawPolicy === undefined) return undefined

  const runtimeSupportsExtraSeats =
    typeof rawPolicy === "object" &&
    rawPolicy !== null &&
    "runtimeSupportsExtraSeats" in rawPolicy &&
    (rawPolicy as { readonly runtimeSupportsExtraSeats?: unknown })
      .runtimeSupportsExtraSeats === true

  const policy = resolveInputSeatPolicy(rawPolicy, {
    launchKind: "remote-managed",
    runtimeSupportsExtraSeats,
  })
  if (!policy.enabled || policy.playerCount === 0) return undefined

  return {
    players: Array.from({ length: policy.playerCount }, (_, index) =>
      applyDerivedSeatDefaults(
        {
          handler: "evdev" as const,
          device: inputSeatNameForSlot(index + 1, policy.seatNamePrefix),
        },
        defaults,
      ),
    ),
  }
}

const applyDerivedSeatDefaults = (
  player: Rpcs3InputPlayer,
  defaults: Rpcs3DerivedSeatDefaults | undefined,
): Rpcs3InputPlayer => {
  if (defaults === undefined) return player
  return {
    ...player,
    ...(defaults.buttons !== undefined ? { buttons: defaults.buttons } : {}),
    ...(defaults.sticks !== undefined ? { sticks: defaults.sticks } : {}),
    ...(defaults.triggers !== undefined ? { triggers: defaults.triggers } : {}),
    ...(defaults.mouse !== undefined ? { mouse: defaults.mouse } : {}),
  }
}

export const rpcs3InputPolicyWithInputSeats = (
  explicit: Rpcs3InputPolicy | undefined,
  launchCompanions: LaunchCompanionMap | undefined,
): Rpcs3InputPolicy | undefined => {
  if (explicit?.players !== undefined) return explicit
  return (
    deriveRpcs3InputPolicyFromInputSeats(
      launchCompanions,
      explicit?.derivedSeatDefaults,
    ) ?? explicit
  )
}
