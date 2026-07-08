import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const EnvironmentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
)

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: `${label} must be non-empty`,
      }),
    ),
  )

const positiveNumber = (label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value > 0
      ? undefined
      : `${label} greater than 0 required`,
  )

const nonNegativeNumber = (label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value >= 0
      ? undefined
      : `${label} greater than or equal to 0 required`,
  )

const PositiveNumber = (label: string) =>
  Schema.Number.check(positiveNumber(label))
const NonNegativeNumber = (label: string) =>
  Schema.Number.check(nonNegativeNumber(label))
const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))
const NonNegativeInteger = (label: string) =>
  Schema.Int.check(nonNegativeNumber(label))

const RyubingPath = NonEmptyString("ryubing.path")
const RyubingEnv = Schema.Record(EnvironmentKey, Schema.String)
const RyubingStringList = Schema.Array(Schema.String)

const RyubingStatePolicy = Schema.Struct({
  root: Schema.optional(RyubingPath),
  create: Schema.optional(Schema.Boolean),
  "config-file": Schema.optional(NonEmptyString("ryubing.config-file")),
  require: Schema.optional(
    Schema.Struct({
      keys: Schema.optional(RyubingStringList),
    }),
  ),
})

const RyubingConfigPolicy = Schema.Struct({
  "merge-existing": Schema.optional(Schema.Boolean),
  "preserve-unknown": Schema.optional(Schema.Boolean),
  version: Schema.optional(Schema.Number),
})

const RyubingContentPolicy = Schema.Struct({
  "game-dirs": Schema.optional(RyubingStringList),
  "autoload-dirs": Schema.optional(RyubingStringList),
  "shown-file-types": Schema.optional(RyubingStringList),
})

const RyubingDisplayPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  /**
   * Ryujinx's headless/no-gui path is not universally equivalent to the GUI
   * path. Some device/windowing stacks (validated on Bandai SM8550) only
   * present Switch output correctly when Ryujinx owns its normal X11 window.
   */
  headless: Schema.optional(Schema.Boolean),
  "hide-cursor": Schema.optional(
    Schema.Literals(["never", "on-idle", "always"]),
  ),
  "show-console": Schema.optional(Schema.Boolean),
  "confirm-exit": Schema.optional(Schema.Boolean),
  "remember-window-state": Schema.optional(Schema.Boolean),
})

const RyubingGraphicsPolicy = Schema.Struct({
  backend: Schema.optional(Schema.Literals(["vulkan", "opengl"])),
  "backend-threading": Schema.optional(Schema.Literals(["auto", "on", "off"])),
  pptc: Schema.optional(Schema.Literals(["enabled", "disabled"])),
  "resolution-scale": Schema.optional(
    PositiveNumber("ryubing.resolution-scale"),
  ),
  "custom-resolution-scale": Schema.optional(
    PositiveNumber("ryubing.custom-resolution-scale"),
  ),
  "max-anisotropy": Schema.optional(
    NonNegativeNumber("ryubing.max-anisotropy"),
  ),
  "aspect-ratio": Schema.optional(Schema.String),
  "anti-aliasing": Schema.optional(Schema.String),
  "scaling-filter": Schema.optional(Schema.String),
  "scaling-filter-level": Schema.optional(
    NonNegativeNumber("ryubing.scaling-filter-level"),
  ),
  "shader-cache": Schema.optional(Schema.Boolean),
  "texture-recompression": Schema.optional(Schema.Boolean),
  "macro-hle": Schema.optional(Schema.Boolean),
})

const RyubingConsolePolicy = Schema.Struct({
  mode: Schema.optional(Schema.Literals(["docked", "handheld"])),
  language: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
  "internet-access": Schema.optional(Schema.Boolean),
  "fs-integrity-checks": Schema.optional(Schema.Boolean),
  "fs-global-access-log-mode": Schema.optional(
    NonNegativeInteger("ryubing.fs-global-access-log-mode"),
  ),
  "ignore-missing-services": Schema.optional(Schema.Boolean),
  "ignore-controller-applet": Schema.optional(Schema.Boolean),
  "skip-user-profile-manager": Schema.optional(Schema.Boolean),
})

const RyubingAudioPolicy = Schema.Struct({
  backend: Schema.optional(
    Schema.Literals(["dummy", "openal", "sound-io", "sdl2"]),
  ),
  volume: Schema.optional(NonNegativeNumber("ryubing.audio.volume")),
})

const RyubingControllerPolicy = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  backend: Schema.optional(Schema.String),
  player: Schema.optional(
    Schema.Union([Schema.String, PositiveInteger("ryubing.controller.player")]),
  ),
  type: Schema.optional(Schema.String),
  deadzone: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  range: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  "trigger-threshold": Schema.optional(Schema.Number),
  rumble: Schema.optional(Schema.Boolean),
  motion: Schema.optional(Schema.Boolean),
  mapping: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})

const RyubingInputPolicy = Schema.Struct({
  keyboard: Schema.optional(Schema.Boolean),
  mouse: Schema.optional(Schema.Boolean),
  "disable-when-out-of-focus": Schema.optional(Schema.Boolean),
  "require-config": Schema.optional(Schema.Boolean),
  controllers: Schema.optional(Schema.Array(RyubingControllerPolicy)),
})

const RyubingNetworkPolicy = Schema.Struct({
  multiplayer: Schema.optional(Schema.String),
  "lan-interface-id": Schema.optional(Schema.String),
  p2p: Schema.optional(Schema.Boolean),
  "ldn-passphrase": Schema.optional(Schema.String),
  "ldn-server": Schema.optional(Schema.String),
})

const RyubingLoggingPolicy = Schema.Struct({
  file: Schema.optional(Schema.Boolean),
  levels: Schema.optional(Schema.Array(Schema.String)),
  "filtered-classes": Schema.optional(Schema.Array(Schema.String)),
})

export const RyubingPolicy = Schema.Struct({
  state: Schema.optional(RyubingStatePolicy),
  env: Schema.optional(RyubingEnv),
  config: Schema.optional(RyubingConfigPolicy),
  content: Schema.optional(RyubingContentPolicy),
  display: Schema.optional(RyubingDisplayPolicy),
  graphics: Schema.optional(RyubingGraphicsPolicy),
  console: Schema.optional(RyubingConsolePolicy),
  audio: Schema.optional(RyubingAudioPolicy),
  input: Schema.optional(RyubingInputPolicy),
  network: Schema.optional(RyubingNetworkPolicy),
  logging: Schema.optional(RyubingLoggingPolicy),
})
export type RyubingPolicy = Schema.Schema.Type<typeof RyubingPolicy>

export const decodeRyubingPolicy = (input: unknown): RyubingPolicy =>
  Schema.decodeUnknownSync(RyubingPolicy)(input, STRICT)
