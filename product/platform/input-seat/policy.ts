import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const INPUT_SEAT_PROVIDER_ID = "@korri:input-seat" as const
export const INPUT_SEAT_MAX_PLAYERS = 4

const PlayerCount = Schema.Int.check(
  Schema.makeFilter<number>(value => {
    if (!Number.isInteger(value) || value < 0) {
      return "input-seat playerCount must be a non-negative integer"
    }
    if (value > INPUT_SEAT_MAX_PLAYERS) {
      return `input-seat supports at most ${INPUT_SEAT_MAX_PLAYERS} players`
    }
    return undefined
  }),
)

const NonEmptySafePrefix = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter<string>(value => {
      if (value.trim().length === 0) return "seatNamePrefix must be non-empty"
      if (/[\n\r"\\]/.test(value)) {
        return "seatNamePrefix contains unsupported config-control characters"
      }
      if (value.length > 48) return "seatNamePrefix must be 48 characters or fewer"
      return undefined
    }),
  ),
)

export const InputSeatPolicy = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  playerCount: Schema.optional(PlayerCount),
  source: Schema.optional(Schema.Literals(["sunshine-moonlight"])),
  seatNamePrefix: Schema.optional(NonEmptySafePrefix),
  runtimeSupportsExtraSeats: Schema.optional(Schema.Boolean),
})
export type InputSeatPolicy = Schema.Schema.Type<typeof InputSeatPolicy>

export interface InputSeatResolveContext {
  readonly launchKind: "remote-managed" | "local-managed"
  readonly runtimeSupportsExtraSeats: boolean
}

export interface ResolvedInputSeatPolicy {
  readonly enabled: boolean
  readonly playerCount: number
  readonly source: "sunshine-moonlight"
  readonly seatNamePrefix: string
  readonly runtimeSupportsExtraSeats: boolean
}

const normalizeInputSeatPolicy = (
  policy: InputSeatPolicy,
  context?: InputSeatResolveContext,
): ResolvedInputSeatPolicy => {
  const runtimeSupportsExtraSeats =
    policy.runtimeSupportsExtraSeats ?? context?.runtimeSupportsExtraSeats ?? false

  const requestedCount = policy.playerCount
  const defaultCount =
    context?.launchKind === "remote-managed" && runtimeSupportsExtraSeats
      ? INPUT_SEAT_MAX_PLAYERS
      : 0
  const playerCount = requestedCount ?? defaultCount

  return {
    enabled: policy.enabled ?? playerCount > 0,
    playerCount,
    source: policy.source ?? "sunshine-moonlight",
    seatNamePrefix: policy.seatNamePrefix ?? "Korri Seat",
    runtimeSupportsExtraSeats,
  }
}

export const decodeInputSeatPolicy = (input: unknown): ResolvedInputSeatPolicy =>
  normalizeInputSeatPolicy(Schema.decodeUnknownSync(InputSeatPolicy)(input, STRICT))

export const resolveInputSeatPolicy = (
  input: unknown,
  context: InputSeatResolveContext,
): ResolvedInputSeatPolicy =>
  normalizeInputSeatPolicy(
    input === undefined
      ? {}
      : Schema.decodeUnknownSync(InputSeatPolicy)(input, STRICT),
    context,
  )
