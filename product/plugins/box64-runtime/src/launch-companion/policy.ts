import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const
const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "Box64 policy values must be non-empty",
    }),
  ),
)
const PositiveInteger = Schema.Int.pipe(
  Schema.check(
    Schema.makeFilter<number>(value =>
      value > 0 ? undefined : "Box64 positive integer required",
    ),
  ),
)

export const Box64Policy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  command: Schema.optional(NonEmptyString),
  unityMode: Schema.optional(Schema.Boolean),
  strongMem: Schema.optional(Schema.Union([Schema.Boolean, PositiveInteger])),
  bigBlock: Schema.optional(Schema.Union([Schema.Boolean, Schema.Int])),
  safeFlags: Schema.optional(Schema.Int),
  fastNan: Schema.optional(Schema.Boolean),
  fastRound: Schema.optional(Schema.Boolean),
  nativeFlags: Schema.optional(Schema.Boolean),
  x87Double: Schema.optional(Schema.Boolean),
  syncRounding: Schema.optional(Schema.Boolean),
  maxCpu: Schema.optional(PositiveInteger),
  preferEmulated: Schema.optional(Schema.Boolean),
  sdlVideoDriver: Schema.optional(NonEmptyString),
  gameLibraryPath: Schema.optional(NonEmptyString),
  nativeLibraryPath: Schema.optional(NonEmptyString),
})
export type Box64Policy = Schema.Schema.Type<typeof Box64Policy>

export const DEFAULT_BOX64_POLICY: Box64Policy = {
  enable: true,
  command: "box64",
  preferEmulated: false,
}

export function decodeBox64Policy(input: unknown): Box64Policy {
  return Schema.decodeUnknownSync(Box64Policy)(input, STRICT)
}

export function normalizeBox64Policy(input: Box64Policy): Box64Policy {
  return { ...DEFAULT_BOX64_POLICY, ...input }
}
