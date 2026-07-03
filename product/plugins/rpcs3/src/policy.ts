import { AppMaterializationFailed } from "@platform/library/config/errors"
import { Schema } from "effect"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"

const STRICT = { onExcessProperty: "error" } as const

const EnvironmentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
)

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(Schema.isMinLength(1, { message: `${label} must be non-empty` })),
  )

const NonNegativeNumber = (label: string) =>
  Schema.Number.check(
    Schema.makeFilter<number>(value =>
      Number.isFinite(value) && value >= 0
        ? undefined
        : `${label} must be greater than or equal to 0`,
    ),
  )

/**
 * Phase 1 — "everyone has an opinion". Clean, delivery-agnostic names; the
 * value→RPCS3 string translation lives in the mapping table (mapping.ts),
 * never here. `aspectRatio` literals are already the RPCS3 config strings.
 */
const Rpcs3VideoPolicy = Schema.Struct({
  resolution: Schema.optional(Schema.String),
  aspectRatio: Schema.optional(
    Schema.Literals(["16:9", "4:3", "16:10", "5:4", "5:3", "21:9"]),
  ),
  fullscreen: Schema.optional(Schema.Boolean),
  frameLimit: Schema.optional(
    Schema.Union([
      Schema.Number,
      Schema.Literals(["off", "auto", "native", "infinite"]),
    ]),
  ),
  vsync: Schema.optional(Schema.Boolean),
})

const Rpcs3AudioPolicy = Schema.Struct({
  volume: Schema.optional(NonNegativeNumber("rpcs3.audio.volume")),
  device: Schema.optional(Schema.String),
})

/**
 * Phase 0 — headless-boot essentials so RPCS3 runs unattended. `--no-gui`
 * is an always-on default of the headless launch, not authored here.
 */
const Rpcs3BootPolicy = Schema.Struct({
  headless: Schema.optional(Schema.Boolean),
  exitOnFinish: Schema.optional(Schema.Boolean),
  suppressPopups: Schema.optional(Schema.Boolean),
  autoStart: Schema.optional(Schema.Boolean),
})

/** Genuinely plugin-specific policy (kept under settings.plugin). */
const Rpcs3StatePolicy = Schema.Struct({
  root: NonEmptyString("rpcs3.state.root"),
})

const Rpcs3FirmwarePolicy = Schema.Struct({
  sentinel: Schema.optional(NonEmptyString("rpcs3.firmware.sentinel")),
})

/**
 * Retained transitional fields the materializer still reads. U7 migrates
 * `command` to the app record, `env` to `context.env`, and `extra.args` to
 * the `overrides` escape hatch, after which these leave the authoring surface.
 */
const Rpcs3ExtraPolicy = Schema.Struct({
  args: Schema.optional(Schema.Array(Schema.String)),
})

export const Rpcs3Policy = Schema.Struct({
  state: Schema.optional(Rpcs3StatePolicy),
  firmware: Schema.optional(Rpcs3FirmwarePolicy),
  video: Schema.optional(Rpcs3VideoPolicy),
  audio: Schema.optional(Rpcs3AudioPolicy),
  boot: Schema.optional(Rpcs3BootPolicy),
  command: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(EnvironmentKey, Schema.String)),
  extra: Schema.optional(Rpcs3ExtraPolicy),
})
export type Rpcs3Policy = Schema.Schema.Type<typeof Rpcs3Policy>

export const DEFAULT_RPCS3_FIRMWARE_SENTINEL =
  "dev_flash/sys/external/liblv2.sprx" as const

export function decodeRpcs3Policy(input: unknown): Rpcs3Policy {
  try {
    return Schema.decodeUnknownSync(Rpcs3Policy)(input ?? {}, STRICT)
  } catch (error) {
    throw policyError(
      `policy is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function policyError(reason: string): AppMaterializationFailed {
  return new AppMaterializationFailed({
    appId: KORRI_RPCS3_PLUGIN_ID,
    reason: `${KORRI_RPCS3_PLUGIN_ID} ${reason}`,
  })
}
