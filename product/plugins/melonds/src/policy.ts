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

const WindowRectanglePolicy = Schema.Struct({
  output: NonEmptyString("melonds.presentation.windows.output"),
  x: Schema.Int,
  y: Schema.Int,
  width: IntInRange("melonds.presentation.windows.width", 1, 10000),
  height: IntInRange("melonds.presentation.windows.height", 1, 10000),
})

const MelonDsPresentationPolicy = Schema.Struct({
  intent: Schema.Literals(["matched-dual-screen"]),
  windows: Schema.Struct({
    top: WindowRectanglePolicy,
    bottom: WindowRectanglePolicy,
  }),
  wayland: Schema.optional(
    Schema.Struct({
      display: NonEmptyString("melonds.presentation.wayland.display"),
      compositorSocket: NonEmptyString(
        "melonds.presentation.wayland.compositorSocket",
      ),
    }),
  ),
  secondaryOutput: Schema.optional(
    Schema.Struct({
      output: NonEmptyString("melonds.presentation.secondaryOutput.output"),
      restore: Schema.optional(Schema.Literals(["observed", "on", "off"])),
    }),
  ),
  menu: Schema.optional(
    Schema.Struct({ hide: Schema.optional(Schema.Boolean) }),
  ),
  input: Schema.optional(
    Schema.Struct({
      profile: Schema.optional(Schema.Literals(["inputplumber-xbox"])),
      joystickId: Schema.optional(
        IntInRange("melonds.presentation.input.joystickId", 0, 16),
      ),
    }),
  ),
})

export const MelonDsPolicy = Schema.Struct({
  state: Schema.optional(MelonDsStatePolicy),
  boot: Schema.optional(MelonDsBootPolicy),
  display: Schema.optional(MelonDsDisplayPolicy),
  video: Schema.optional(MelonDsVideoPolicy),
  presentation: Schema.optional(MelonDsPresentationPolicy),
})
export type MelonDsPolicy = Schema.Schema.Type<typeof MelonDsPolicy>
export type MelonDsWindowRectangle = Schema.Schema.Type<
  typeof WindowRectanglePolicy
>

export function decodeMelonDsPolicy(input: unknown): MelonDsPolicy {
  try {
    const policy = Schema.decodeUnknownSync(MelonDsPolicy)(input ?? {}, STRICT)
    validateMelonDsPolicy(policy)
    return policy
  } catch (error) {
    if (error instanceof AppMaterializationFailed) throw error
    throw policyError(
      `policy is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function validateMelonDsPolicy(policy: MelonDsPolicy): void {
  if (
    policy.presentation?.intent === "matched-dual-screen" &&
    policy.display?.mode !== undefined &&
    policy.display.mode !== "dual-window"
  ) {
    throw policyError(
      "policy is invalid: matched-dual-screen presentation requires display.mode to be dual-window",
    )
  }
}

function policyError(reason: string): AppMaterializationFailed {
  return new AppMaterializationFailed({
    appId: KORRI_MELONDS_PLUGIN_ID,
    reason: `${KORRI_MELONDS_PLUGIN_ID} ${reason}`,
  })
}
