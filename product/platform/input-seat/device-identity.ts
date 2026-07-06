import { Schema } from "effect"
import { INPUT_SEAT_MAX_PLAYERS } from "./policy"

const STRICT = { onExcessProperty: "error" } as const

const Slot = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 1 && value <= INPUT_SEAT_MAX_PLAYERS
      ? undefined
      : `slot must be in [1, ${INPUT_SEAT_MAX_PLAYERS}]`,
  ),
)

const PlayerIndex = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value < INPUT_SEAT_MAX_PLAYERS
      ? undefined
      : `playerIndex must be in [0, ${INPUT_SEAT_MAX_PLAYERS - 1}]`,
  ),
)

const SafeSeatName = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter<string>(value => {
      if (value.trim().length === 0) return "seat name must be non-empty"
      if (value.length > 64) return "seat name must be 64 characters or fewer"
      if (/[\n\r"\\]/.test(value)) {
        return "seat name contains unsupported config-control characters"
      }
      return undefined
    }),
  ),
)

const OptionalSafeString = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter<string>(value => {
      if (value.length > 128) return "identity string must be 128 characters or fewer"
      if (/[\n\r]/.test(value)) return "identity string cannot contain newlines"
      return undefined
    }),
  ),
)

export const InputSeatIdentity = Schema.Struct({
  slot: Slot,
  playerIndex: PlayerIndex,
  name: SafeSeatName,
  backend: Schema.Literals(["evdev", "sdl"]),
  deviceClass: Schema.Literals(["gamepad"]),
  capabilityProfile: Schema.Literals(["xbox360-gamepad"]),
  vendorId: Schema.optional(OptionalSafeString),
  productId: Schema.optional(OptionalSafeString),
  phys: Schema.optional(OptionalSafeString),
  uniq: Schema.optional(OptionalSafeString),
  eventPath: Schema.optional(OptionalSafeString),
  readiness: Schema.optional(
    Schema.Struct({
      readable: Schema.Boolean,
      verifiedAt: OptionalSafeString,
    }),
  ),
})
export type InputSeatIdentity = Schema.Schema.Type<typeof InputSeatIdentity>

export const inputSeatNameForSlot = (
  slot: number,
  prefix = "Korri Seat",
): string => {
  Schema.decodeUnknownSync(Slot)(slot)
  Schema.decodeUnknownSync(SafeSeatName)(prefix)
  return `${prefix} P${slot}`
}

export const decodeInputSeatIdentity = (input: unknown): InputSeatIdentity =>
  Schema.decodeUnknownSync(InputSeatIdentity)(input, STRICT)
