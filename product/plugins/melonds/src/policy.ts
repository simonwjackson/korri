import { AppMaterializationFailed } from "@platform/library/config/errors"
import { Schema } from "effect"
import { KORRI_MELONDS_PLUGIN_ID } from "./ids"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, { message: `${label} must be non-empty` }),
    ),
  )

const IntInRange = (label: string, min: number, max: number) =>
  Schema.Int.check(
    Schema.makeFilter<number>(value =>
      Number.isInteger(value) && value >= min && value <= max
        ? undefined
        : `${label} must be an integer in [${min}, ${max}]`,
    ),
  )

const MelonDsStatePolicy = Schema.Struct({
  root: NonEmptyString("melonds.state.root"),
})

const MelonDsBootPolicy = Schema.Struct({
  direct: Schema.optional(Schema.Boolean),
})

const MelonDsDisplayPolicy = Schema.Struct({
  mode: Schema.optional(
    Schema.Literals([
      "vertical",
      "horizontal",
      "hybrid",
      "top-only",
      "bottom-only",
      "dual-window",
    ]),
  ),
  sizing: Schema.optional(
    Schema.Literals(["even", "emphasize-top", "emphasize-bottom", "auto"]),
  ),
  gap: Schema.optional(IntInRange("melonds.display.gap", 0, 500)),
  swap: Schema.optional(Schema.Boolean),
  integerScaling: Schema.optional(Schema.Boolean),
})

const MelonDsVideoPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  renderer: Schema.optional(
    Schema.Literals(["software", "opengl", "opengl-compute"]),
  ),
  scaleFactor: Schema.optional(IntInRange("melonds.video.scaleFactor", 1, 16)),
})

export const MelonDsPolicy = Schema.Struct({
  state: Schema.optional(MelonDsStatePolicy),
  boot: Schema.optional(MelonDsBootPolicy),
  display: Schema.optional(MelonDsDisplayPolicy),
  video: Schema.optional(MelonDsVideoPolicy),
})
export type MelonDsPolicy = Schema.Schema.Type<typeof MelonDsPolicy>

export function decodeMelonDsPolicy(input: unknown): MelonDsPolicy {
  try {
    return Schema.decodeUnknownSync(MelonDsPolicy)(input ?? {}, STRICT)
  } catch (error) {
    throw policyError(
      `policy is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function policyError(reason: string): AppMaterializationFailed {
  return new AppMaterializationFailed({
    appId: KORRI_MELONDS_PLUGIN_ID,
    reason: `${KORRI_MELONDS_PLUGIN_ID} ${reason}`,
  })
}
