import { AppMaterializationFailed } from "@platform/library/config/errors"
import { Schema } from "effect"
import { KORRI_RPCS3_PLUGIN_ID } from "./ids"
import { Rpcs3InputPolicy } from "./input-policy"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, { message: `${label} must be non-empty` }),
    ),
  )

const NonNegativeNumber = (label: string) =>
  Schema.Number.check(
    Schema.makeFilter<number>(value =>
      Number.isFinite(value) && value >= 0
        ? undefined
        : `${label} must be greater than or equal to 0`,
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

/**
 * Phase 1 — "everyone has an opinion". Clean, delivery-agnostic names; the
 * value→RPCS3 string translation lives in the mapping table (mapping.ts),
 * never here. `aspectRatio` literals are already the RPCS3 config strings.
 */
const Rpcs3VideoPolicy = Schema.Struct({
  resolution: Schema.optional(Schema.String),
  // RPCS3 video_aspect enum only defines 4:3 and 16:9 (verified against
  // system_config_types.cpp); no other ratios are accepted.
  aspectRatio: Schema.optional(Schema.Literals(["16:9", "4:3"])),
  fullscreen: Schema.optional(Schema.Boolean),
  // RPCS3 frame_limit_type enum: numeric 30/50/60/120 or a named mode.
  frameLimit: Schema.optional(
    Schema.Union([
      Schema.Literals([30, 50, 60, 120]),
      Schema.Literals(["off", "auto", "native", "infinite", "display"]),
    ]),
  ),
  vsync: Schema.optional(Schema.Boolean),
  // Phase 2 — power-user video tweaks.
  renderer: Schema.optional(Schema.Literals(["vulkan", "opengl", "null"])),
  resolutionScale: Schema.optional(
    IntInRange("rpcs3.video.resolutionScale", 25, 800),
  ),
  anisotropicFilter: Schema.optional(
    IntInRange("rpcs3.video.anisotropicFilter", 0, 16),
  ),
  shaderMode: Schema.optional(
    Schema.Literals(["legacy", "async", "async-interpreter", "interpreter"]),
  ),
  // Phase 3 — per-game GPU accuracy toggles (Video-node booleans + MSAA).
  writeColorBuffers: Schema.optional(Schema.Boolean),
  writeDepthBuffer: Schema.optional(Schema.Boolean),
  readColorBuffers: Schema.optional(Schema.Boolean),
  strictRendering: Schema.optional(Schema.Boolean),
  disableZcull: Schema.optional(Schema.Boolean),
  msaa: Schema.optional(Schema.Literals(["disabled", "auto"])),
})

const Rpcs3AudioPolicy = Schema.Struct({
  volume: Schema.optional(NonNegativeNumber("rpcs3.audio.volume")),
  device: Schema.optional(Schema.String),
  // Phase 2 — power-user audio tweaks.
  backend: Schema.optional(
    Schema.Literals(["cubeb", "faudio", "xaudio2", "null"]),
  ),
  format: Schema.optional(
    Schema.Literals([
      "stereo",
      "surround-5.1",
      "surround-7.1",
      "automatic",
      "manual",
    ]),
  ),
})

/** Phase 2 — system locale/region. */
const Rpcs3SystemPolicy = Schema.Struct({
  language: Schema.optional(
    Schema.Literals([
      "ja",
      "en-US",
      "fr",
      "es",
      "de",
      "it",
      "nl",
      "pt-PT",
      "ru",
      "ko",
      "zh-Hant",
      "zh-Hans",
      "fi",
      "sv",
      "da",
      "no",
      "pl",
      "en-GB",
      "pt-BR",
      "tr",
    ]),
  ),
  licenseArea: Schema.optional(
    Schema.Literals([
      "japan",
      "america",
      "europe",
      "asia",
      "korea",
      "china",
      "other",
    ]),
  ),
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
 * Phase 3 — per-game CPU/SPU accuracy tuning. Clean, delivery-agnostic names;
 * the value→RPCS3 string translation lives in the mapping table. Enum sets and
 * ranges verified against RPCS3 system_config.h / system_config_types.cpp
 * (build 0.0.41-nixpkgs-40e9ee5): the legacy SPU "Interpreter (dynamic)" is
 * intentionally omitted from the authored surface.
 */
const Rpcs3CorePolicy = Schema.Struct({
  ppuDecoder: Schema.optional(
    Schema.Literals(["interpreter-static", "llvm-recompiler"]),
  ),
  spuDecoder: Schema.optional(
    Schema.Literals([
      "interpreter-static",
      "asmjit-recompiler",
      "llvm-recompiler",
    ]),
  ),
  spuBlockSize: Schema.optional(Schema.Literals(["safe", "mega", "giga"])),
  spuXFloatAccuracy: Schema.optional(
    Schema.Literals(["accurate", "approximate", "relaxed", "inaccurate"]),
  ),
  preferredSpuThreads: Schema.optional(
    IntInRange("rpcs3.core.preferredSpuThreads", 0, 6),
  ),
  clocksScale: Schema.optional(IntInRange("rpcs3.core.clocksScale", 10, 3000)),
  librariesControl: Schema.optional(Schema.Array(Schema.String)),
})

/**
 * The authoring surface is delivery-agnostic and free of launcher plumbing:
 * `command` is the app-record field, `env` is the standard `context.env`, and
 * raw argv/config passthrough is the settled `overrides` escape hatch. None of
 * those appear here.
 */
export const Rpcs3Policy = Schema.Struct({
  state: Schema.optional(Rpcs3StatePolicy),
  firmware: Schema.optional(Rpcs3FirmwarePolicy),
  video: Schema.optional(Rpcs3VideoPolicy),
  audio: Schema.optional(Rpcs3AudioPolicy),
  boot: Schema.optional(Rpcs3BootPolicy),
  system: Schema.optional(Rpcs3SystemPolicy),
  core: Schema.optional(Rpcs3CorePolicy),
  // Per-player pad / keyboard-as-pad authoring (materialized to a separate
  // input_configs profile, not config.yml). Large schema lives in input-policy.ts.
  input: Schema.optional(Rpcs3InputPolicy),
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
