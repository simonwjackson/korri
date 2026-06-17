/**
 * Ephemeral override — the most-specific cascade layer, supplied at
 * `prepare.rpc` time as an optional field on the payload.
 *
 * Shape mirrors `PresetPayload` minus the namespace fields (`name`,
 * `description`) and minus nested presets. The strict-mode decode
 * rejects identity-field bypass attempts (`system`, `contentPath`),
 * keeping the cascade's identity invariant intact even for runtime
 * one-off launches.
 *
 * Use case: the renderer wants to launch this game "right now with
 * extra args" without persisting a preset. The override flows from
 * RPC → cascade resolver → launch intent → runner without ever
 * touching ProseQL.
 */

import { KORRI_GAMESCOPE_PLUGIN_ID } from "@platform/plugin/ids"
import { Schema } from "effect"

import {
  GamescopeBackend,
  GamescopeFilter,
  GamescopeGenerateDrmMode,
  GamescopeOrientation,
  GamescopeScaler,
  GamescopeTouchMode,
  GamescopeVirtualConnectorStrategy,
  InheritableLayer,
  MoonlightCodec,
  MoonlightControlAuthority,
  MoonlightRotation,
} from "./inheritable-fields"
import { LaunchBlock } from "./launch-block"

const STRICT = { onExcessProperty: "error" } as const

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

const finiteNumberRange = (min: number, max: number, label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value >= min && value <= max
      ? undefined
      : `${label} between ${min} and ${max} required`,
  )

const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))

const NonNegativeInteger = (label: string) =>
  Schema.Int.check(nonNegativeNumber(label))

const PositiveNumber = (label: string) =>
  Schema.Number.check(positiveNumber(label))

const NonNegativeNumber = (label: string) =>
  Schema.Number.check(nonNegativeNumber(label))

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: `${label} must be non-empty`,
      }),
    ),
  )

const NullablePositiveInteger = (label: string) =>
  Schema.NullOr(PositiveInteger(label))

const GamescopeOverrideBackendPolicy = Schema.Struct({
  type: Schema.optional(GamescopeBackend),
  allowDeferred: Schema.optional(Schema.Boolean),
})

const GamescopeOverrideWindowPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  borderless: Schema.optional(Schema.Boolean),
  grabKeyboard: Schema.optional(Schema.Boolean),
  forceGrabCursor: Schema.optional(Schema.Boolean),
  displayIndex: Schema.optional(NonNegativeInteger("window.displayIndex")),
  forceWindowsFullscreen: Schema.optional(Schema.Boolean),
  exposeWayland: Schema.optional(Schema.Boolean),
  xwaylandCount: Schema.optional(PositiveInteger("window.xwaylandCount")),
  fadeOutDuration: Schema.optional(NonNegativeNumber("window.fadeOutDuration")),
})

const GamescopeOverrideDisplayPolicy = Schema.Struct({
  output: Schema.optional(
    Schema.Struct({
      width: Schema.optional(PositiveNumber("display.output.width")),
      height: Schema.optional(PositiveNumber("display.output.height")),
      preferredConnectors: Schema.optional(
        Schema.Array(NonEmptyString("display.output.preferredConnectors[]")),
      ),
    }),
  ),
  nested: Schema.optional(
    Schema.Struct({
      width: Schema.optional(PositiveNumber("display.nested.width")),
      height: Schema.optional(PositiveNumber("display.nested.height")),
      refresh: Schema.optional(PositiveNumber("display.nested.refresh")),
      unfocusedRefresh: Schema.optional(
        PositiveNumber("display.nested.unfocusedRefresh"),
      ),
    }),
  ),
  scale: Schema.optional(
    Schema.Struct({
      max: Schema.optional(PositiveNumber("display.scale.max")),
    }),
  ),
  orientation: Schema.optional(GamescopeOrientation),
  adaptiveSync: Schema.optional(Schema.Boolean),
  framerateLimit: Schema.optional(NonNegativeNumber("display.framerateLimit")),
})

const GamescopeOverrideScalingPolicy = Schema.Struct({
  scaler: Schema.optional(GamescopeScaler),
  filter: Schema.optional(GamescopeFilter),
  sharpness: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 20, "scaling.sharpness")),
  ),
})

const GamescopeOverrideCursorPolicy = Schema.Struct({
  hideDelay: Schema.optional(NonNegativeNumber("cursor.hideDelay")),
  scaleHeight: Schema.optional(PositiveNumber("cursor.scaleHeight")),
})

const GamescopeOverrideInputPolicy = Schema.Struct({
  mouseSensitivity: Schema.optional(PositiveNumber("input.mouseSensitivity")),
  defaultTouchMode: Schema.optional(GamescopeTouchMode),
})

const GamescopeOverrideEmbeddedPolicy = Schema.Struct({
  generateDrmMode: Schema.optional(GamescopeGenerateDrmMode),
  immediateFlips: Schema.optional(Schema.Boolean),
  virtualConnectorStrategy: Schema.optional(GamescopeVirtualConnectorStrategy),
})

const GamescopeOverrideHdrPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  sdrGamutWideness: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 1, "hdr.sdrGamutWideness")),
  ),
  sdrContentNits: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 10000, "hdr.sdrContentNits")),
  ),
  inverseToneMapping: Schema.optional(
    Schema.Struct({
      enable: Schema.optional(Schema.Boolean),
      sdrNits: Schema.optional(
        Schema.Number.check(finiteNumberRange(0, 1000, "hdr.itm.sdrNits")),
      ),
      targetNits: Schema.optional(
        Schema.Number.check(finiteNumberRange(0, 10000, "hdr.itm.targetNits")),
      ),
    }),
  ),
})

const GamescopeOverridePolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  backend: Schema.optional(GamescopeOverrideBackendPolicy),
  window: Schema.optional(GamescopeOverrideWindowPolicy),
  display: Schema.optional(GamescopeOverrideDisplayPolicy),
  scaling: Schema.optional(GamescopeOverrideScalingPolicy),
  cursor: Schema.optional(GamescopeOverrideCursorPolicy),
  input: Schema.optional(GamescopeOverrideInputPolicy),
  embedded: Schema.optional(GamescopeOverrideEmbeddedPolicy),
  hdr: Schema.optional(GamescopeOverrideHdrPolicy),
})

const EphemeralLaunchWithPolicy = Schema.Struct({
  [KORRI_GAMESCOPE_PLUGIN_ID]: Schema.optional(GamescopeOverridePolicy),
})

const EphemeralLaunchBlock = Schema.Struct({
  ...LaunchBlock.fields,
  with: Schema.optional(EphemeralLaunchWithPolicy),
})

const EphemeralLaunchPolicy = Schema.Struct({
  with: Schema.optional(EphemeralLaunchWithPolicy),
})

const MoonlightOverrideResolutionPolicy = Schema.Struct({
  width: Schema.optional(PositiveInteger("stream.resolution.width")),
  height: Schema.optional(PositiveInteger("stream.resolution.height")),
})

const MoonlightOverrideStreamPolicy = Schema.Struct({
  resolution: Schema.optional(MoonlightOverrideResolutionPolicy),
  fps: Schema.optional(PositiveInteger("stream.fps")),
  bitrateKbps: Schema.optional(NullablePositiveInteger("stream.bitrateKbps")),
  packetSizeBytes: Schema.optional(
    NullablePositiveInteger("stream.packetSizeBytes"),
  ),
  codec: Schema.optional(MoonlightCodec),
  remoteOptimizations: Schema.optional(Schema.Boolean),
  unsupportedHost: Schema.optional(Schema.Boolean),
  quitAppAfter: Schema.optional(Schema.Boolean),
  noSops: Schema.optional(Schema.Boolean),
  localAudio: Schema.optional(Schema.Boolean),
  surround: Schema.optional(Schema.Boolean),
})

const MoonlightOverridePlatformPolicy = Schema.Struct({
  name: Schema.optional(NonEmptyString("platform.name")),
})

const MoonlightOverrideTouchBoundsPolicy = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  w: PositiveInteger("input.touch.bounds.w"),
  h: PositiveInteger("input.touch.bounds.h"),
})

const MoonlightOverrideTouchPolicy = Schema.Struct({
  absolute: Schema.optional(Schema.Boolean),
  requireBounds: Schema.optional(Schema.Boolean),
  bounds: Schema.optional(Schema.NullOr(MoonlightOverrideTouchBoundsPolicy)),
})

const MoonlightOverrideInputPolicy = Schema.Struct({
  devices: Schema.optional(Schema.Array(NonEmptyString("input.devices[]"))),
  mappingFile: Schema.optional(NonEmptyString("input.mappingFile")),
  viewOnly: Schema.optional(Schema.Boolean),
  rotate: Schema.optional(MoonlightRotation),
  touch: Schema.optional(MoonlightOverrideTouchPolicy),
})

const MoonlightOverrideAudioPolicy = Schema.Struct({
  device: Schema.optional(Schema.NullOr(NonEmptyString("audio.device"))),
})

const MoonlightOverrideWindowPolicy = Schema.Struct({
  windowed: Schema.optional(Schema.Boolean),
  autoResize: Schema.optional(Schema.Boolean),
})

const MoonlightOverrideControlPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  authority: Schema.optional(MoonlightControlAuthority),
})

const MoonlightOverridePolicy = Schema.Struct({
  logging: Schema.optional(
    Schema.Struct({
      verbose: Schema.optional(Schema.Boolean),
      debug: Schema.optional(Schema.Boolean),
    }),
  ),
  stream: Schema.optional(MoonlightOverrideStreamPolicy),
  platform: Schema.optional(MoonlightOverridePlatformPolicy),
  input: Schema.optional(MoonlightOverrideInputPolicy),
  audio: Schema.optional(MoonlightOverrideAudioPolicy),
  window: Schema.optional(MoonlightOverrideWindowPolicy),
  control: Schema.optional(MoonlightOverrideControlPolicy),
})

const EphemeralInheritableLayer = Schema.Struct({
  launch: Schema.optional(EphemeralLaunchPolicy),
  moonlight: Schema.optional(MoonlightOverridePolicy),
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})

const EphemeralByLauncherPayload = Schema.Record(
  Schema.String,
  EphemeralInheritableLayer,
)

export const EphemeralOverride = Schema.Struct({
  launch: Schema.optional(EphemeralLaunchBlock),
  launcher: Schema.optional(Schema.String),
  inherit: Schema.optional(Schema.Boolean),
  byLauncher: Schema.optional(EphemeralByLauncherPayload),

  // Inlined inheritable whitelist. Gamescope and Moonlight overrides
  // intentionally use narrower schemas than persisted readable policy:
  // app.library.launch is unauthenticated on trusted-LAN deployments, so
  // runtime overrides must not expose command/env/raw-argv/key storage/path
  // process surfaces.
  moonlight: Schema.optional(MoonlightOverridePolicy),
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type EphemeralOverride = Schema.Schema.Type<typeof EphemeralOverride>

export const decodeEphemeralOverride = (input: unknown): EphemeralOverride =>
  Schema.decodeUnknownSync(EphemeralOverride)(input, STRICT)
