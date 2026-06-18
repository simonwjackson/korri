/**
 * Inheritable-field whitelist for the seven-layer config cascade.
 *
 * Every layer-bearing record (`GlobalConfigPayload`, `UserPayload`,
 * `SystemPayload`, `LauncherPayload`, `GamePayload`, `PresetPayload`,
 * `EphemeralOverride`) carries a subset of these fields plus a
 * `byLauncher?: ByLauncherPayload` sub-map that scopes contributions to
 * a specific launcher id.
 *
 * Schemas decode in strict whitelist mode — unknown keys fail loudly so
 * typos (`gamescpoe`) surface at decode time with the offending key
 * path, rather than being silently stripped and disappearing into
 * "inherits from less-specific layer."
 *
 * Field-by-field merge rules (applied by the cascade resolver, not the
 * schema):
 * - `launch.with`      → provider-keyed launch companion map; object values
 *                         → deep merge, arrays concatenate in inheritance order,
 *                         → scalars last-win
 * - `moonlight`          → deep merge per nested key; scalars last-wins
 * - `moonlight.input.devices` / `moonlight.extraArgs`
 *                         → list concat in inheritance order
 * - `moonlight.environment`
 *                         → map merge; `null` means executable env unset
 * - `plugin`            → provider-keyed map; object values deep merge,
 *                         → arrays concatenate in inheritance order
 * - `steam`              → deep merge per nested key; `extra.args` concatenates;
 *                         → `launch-options` last-wins
 * - `env`                → map merge per key; more-specific wins
 * - `cwd`                → scalar; most-specific path wins
 * - `argsAppend`         → list concat in inheritance order
 * - `patches`            → list concat in inheritance order
 * - `byLauncher[L]`      → merged when the resolved launcher equals L
 */

import type { ProviderId } from "@platform/plugin"
import { Schema } from "effect"

import {
  isRetroArchConfigKey,
  isRetroArchPlaintextCredentialSettingKey,
  validateNullableRetroArchHttpsUrl,
} from "./retroarch-setting-policy"

const STRICT = { onExcessProperty: "error" } as const

export const LaunchSettingValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
])
export type LaunchSettingValue = Schema.Schema.Type<typeof LaunchSettingValue>

const finiteNumberRange = (min: number, max: number, label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value >= min && value <= max
      ? undefined
      : `${label} between ${min} and ${max} required`,
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

const EnvironmentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
)

const EnvironmentOverlay = Schema.Record(
  EnvironmentKey,
  Schema.NullOr(Schema.String),
)
export type EnvironmentOverlay = Schema.Schema.Type<typeof EnvironmentOverlay>

const PositiveNumber = (label: string) =>
  Schema.Number.check(positiveNumber(label))
const NonNegativeNumber = (label: string) =>
  Schema.Number.check(nonNegativeNumber(label))
const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))
const NonNegativeInteger = (label: string) =>
  Schema.Int.check(nonNegativeNumber(label))

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: `${label} must be non-empty`,
      }),
    ),
  )

const ProviderIdKey = Schema.String.check(
  Schema.isPattern(/^@[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/),
)

export const LaunchCompanionPayload = Schema.Unknown
export type LaunchCompanionPayload = Schema.Schema.Type<
  typeof LaunchCompanionPayload
>

export const LaunchCompanionMap = Schema.Record(
  ProviderIdKey,
  LaunchCompanionPayload,
)
export type LaunchCompanionMap = Readonly<Record<ProviderId, unknown>>

export const LaunchWithPolicy = LaunchCompanionMap
export type LaunchWithPolicy = LaunchCompanionMap

export const PluginPolicyPayload = Schema.Unknown
export type PluginPolicyPayload = Schema.Schema.Type<typeof PluginPolicyPayload>

export const PluginPolicyMap = Schema.Record(ProviderIdKey, PluginPolicyPayload)
export type PluginPolicyMap = Readonly<Record<ProviderId, unknown>>

export const LaunchPolicy = Schema.Struct({
  with: Schema.optional(LaunchWithPolicy),
})
export type LaunchPolicy = Schema.Schema.Type<typeof LaunchPolicy>

export const launchCompanionsFromLaunch = (layer: {
  readonly launch?: LaunchPolicy
}): LaunchCompanionMap | undefined =>
  layer.launch?.with as LaunchCompanionMap | undefined

const NullablePositiveInteger = (label: string) =>
  Schema.NullOr(PositiveInteger(label))

const NullableNonEmptyString = (label: string) =>
  Schema.NullOr(NonEmptyString(label))

const NullableHttpsUrl = (label: string) =>
  Schema.NullOr(
    NonEmptyString(label).pipe(
      Schema.check(
        Schema.makeFilter(value =>
          validateNullableRetroArchHttpsUrl(value, label),
        ),
      ),
    ),
  )

export const MoonlightCodec = Schema.Literals(["auto", "h264", "h265"])
export type MoonlightCodec = Schema.Schema.Type<typeof MoonlightCodec>

export const MoonlightRotation = Schema.Union([
  Schema.Literal(0),
  Schema.Literal(90),
  Schema.Literal(180),
  Schema.Literal(270),
])
export type MoonlightRotation = Schema.Schema.Type<typeof MoonlightRotation>

export const MoonlightControlAuthority = Schema.Literals([
  "observer",
  "controller",
])
export type MoonlightControlAuthority = Schema.Schema.Type<
  typeof MoonlightControlAuthority
>

const MoonlightLoggingPolicy = Schema.Struct({
  verbose: Schema.optional(Schema.Boolean),
  debug: Schema.optional(Schema.Boolean),
})

const MoonlightResolutionPolicy = Schema.Struct({
  width: Schema.optional(PositiveInteger("stream.resolution.width")),
  height: Schema.optional(PositiveInteger("stream.resolution.height")),
})

const MoonlightStreamPolicy = Schema.Struct({
  resolution: Schema.optional(MoonlightResolutionPolicy),
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
  keyDir: Schema.optional(NullableNonEmptyString("stream.keyDir")),
})

const MoonlightPlatformPolicy = Schema.Struct({
  name: Schema.optional(NonEmptyString("platform.name")),
})

const MoonlightTouchBoundsPolicy = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  w: PositiveInteger("input.touch.bounds.w"),
  h: PositiveInteger("input.touch.bounds.h"),
})

const MoonlightTouchPolicy = Schema.Struct({
  absolute: Schema.optional(Schema.Boolean),
  requireBounds: Schema.optional(Schema.Boolean),
  bounds: Schema.optional(Schema.NullOr(MoonlightTouchBoundsPolicy)),
})

const MoonlightInputPolicy = Schema.Struct({
  devices: Schema.optional(Schema.Array(NonEmptyString("input.devices[]"))),
  mappingFile: Schema.optional(NonEmptyString("input.mappingFile")),
  viewOnly: Schema.optional(Schema.Boolean),
  rotate: Schema.optional(MoonlightRotation),
  touch: Schema.optional(MoonlightTouchPolicy),
})

const MoonlightAudioPolicy = Schema.Struct({
  device: Schema.optional(NullableNonEmptyString("audio.device")),
})

const MoonlightWindowPolicy = Schema.Struct({
  windowed: Schema.optional(Schema.Boolean),
  autoResize: Schema.optional(Schema.Boolean),
})

const MoonlightControlPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  authority: Schema.optional(MoonlightControlAuthority),
  allowRootPeers: Schema.optional(Schema.Boolean),
})

/**
 * Typed Moonlight Embedded stream launch policy for Korri product launches.
 * The stream action, fixed Korri Stream app, and selected peer host are product
 * invariants and are intentionally not configurable in readable policy.
 */
export const MoonlightPolicy = Schema.Struct({
  command: Schema.optional(NonEmptyString("command")),
  environment: Schema.optional(EnvironmentOverlay),
  logging: Schema.optional(MoonlightLoggingPolicy),
  stream: Schema.optional(MoonlightStreamPolicy),
  platform: Schema.optional(MoonlightPlatformPolicy),
  input: Schema.optional(MoonlightInputPolicy),
  audio: Schema.optional(MoonlightAudioPolicy),
  window: Schema.optional(MoonlightWindowPolicy),
  control: Schema.optional(MoonlightControlPolicy),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
})
export type MoonlightPolicy = Schema.Schema.Type<typeof MoonlightPolicy>

export const RetroArchAspectRatio = Schema.Literals([
  "config",
  "square",
  "core-provided",
  "custom",
  "full",
])
export type RetroArchAspectRatio = Schema.Schema.Type<
  typeof RetroArchAspectRatio
>

export const RetroArchMenuToggleGamepadCombo = Schema.Literals([
  "none",
  "down-y-l-r",
  "l3-r3",
  "l1-r1-start-select",
  "start-select",
  "l3-r",
  "l-r",
  "hold-start",
  "hold-select",
  "down-select",
  "l2-r2",
])
export type RetroArchMenuToggleGamepadCombo = Schema.Schema.Type<
  typeof RetroArchMenuToggleGamepadCombo
>

const RetroArchAppendConfigPath = NonEmptyString("configFile.append[]").check(
  Schema.makeFilter(value =>
    value.includes("|")
      ? "configFile.append paths must not contain '|'"
      : undefined,
  ),
)

const RetroArchConfigFilePolicy = Schema.Struct({
  mode: Schema.optional(Schema.Literal("generated")),
  append: Schema.optional(Schema.Array(RetroArchAppendConfigPath)),
})

const RetroArchPathPolicy = Schema.Struct({
  path: Schema.optional(NonEmptyString("path")),
})

const RetroArchLoggingPolicy = Schema.Struct({
  verbose: Schema.optional(Schema.Boolean),
  logFile: Schema.optional(NullableNonEmptyString("logging.logFile")),
  verbosity: Schema.optional(Schema.Boolean),
  libretroLogLevel: Schema.optional(NonEmptyString("logging.libretroLogLevel")),
  fpsShow: Schema.optional(Schema.Boolean),
  memoryShow: Schema.optional(Schema.Boolean),
  framecountShow: Schema.optional(Schema.Boolean),
})

const RetroArchLifecyclePolicy = Schema.Struct({
  saveOnExit: Schema.optional(Schema.Boolean),
  autoOverrides: Schema.optional(Schema.Boolean),
  autoRemaps: Schema.optional(Schema.Boolean),
  gameSpecificOptions: Schema.optional(Schema.Boolean),
  autoShaders: Schema.optional(Schema.Boolean),
  showHiddenFiles: Schema.optional(Schema.Boolean),
  loadDummyOnCoreShutdown: Schema.optional(Schema.Boolean),
  historyListEnable: Schema.optional(Schema.Boolean),
  performanceCounters: Schema.optional(Schema.Boolean),
  allUsersControlMenu: Schema.optional(Schema.Boolean),
  suspendScreensaver: Schema.optional(Schema.Boolean),
  sustainedPerformanceMode: Schema.optional(Schema.Boolean),
  gameMode: Schema.optional(Schema.Boolean),
})

const RetroArchDriversPolicy = Schema.Struct({
  input: Schema.optional(NonEmptyString("drivers.input")),
  joypad: Schema.optional(NonEmptyString("drivers.joypad")),
  video: Schema.optional(NonEmptyString("drivers.video")),
  audio: Schema.optional(NonEmptyString("drivers.audio")),
  resampler: Schema.optional(NonEmptyString("drivers.resampler")),
  menu: Schema.optional(NonEmptyString("drivers.menu")),
  camera: Schema.optional(NonEmptyString("drivers.camera")),
  location: Schema.optional(NonEmptyString("drivers.location")),
  record: Schema.optional(NonEmptyString("drivers.record")),
})

const RetroArchNullablePath = (label: string) => NullableNonEmptyString(label)

const RetroArchPathsPolicy = Schema.Struct({
  systemDirectory: Schema.optional(NonEmptyString("paths.systemDirectory")),
  savefileDirectory: Schema.optional(NonEmptyString("paths.savefileDirectory")),
  savestateDirectory: Schema.optional(
    NonEmptyString("paths.savestateDirectory"),
  ),
  screenshotDirectory: Schema.optional(
    NonEmptyString("paths.screenshotDirectory"),
  ),
  contentDirectory: Schema.optional(
    RetroArchNullablePath("paths.contentDirectory"),
  ),
  cacheDirectory: Schema.optional(
    RetroArchNullablePath("paths.cacheDirectory"),
  ),
  assetsDirectory: Schema.optional(
    RetroArchNullablePath("paths.assetsDirectory"),
  ),
  thumbnailsDirectory: Schema.optional(
    RetroArchNullablePath("paths.thumbnailsDirectory"),
  ),
  playlistDirectory: Schema.optional(
    RetroArchNullablePath("paths.playlistDirectory"),
  ),
  libretroDirectory: Schema.optional(
    RetroArchNullablePath("paths.libretroDirectory"),
  ),
  libretroInfoPath: Schema.optional(
    RetroArchNullablePath("paths.libretroInfoPath"),
  ),
  coreAssetsDirectory: Schema.optional(
    RetroArchNullablePath("paths.coreAssetsDirectory"),
  ),
  coreOptionsPath: Schema.optional(
    RetroArchNullablePath("paths.coreOptionsPath"),
  ),
  joypadAutoconfigDirectory: Schema.optional(
    RetroArchNullablePath("paths.joypadAutoconfigDirectory"),
  ),
  inputRemappingDirectory: Schema.optional(
    RetroArchNullablePath("paths.inputRemappingDirectory"),
  ),
  overlayDirectory: Schema.optional(
    RetroArchNullablePath("paths.overlayDirectory"),
  ),
  videoShaderDirectory: Schema.optional(
    RetroArchNullablePath("paths.videoShaderDirectory"),
  ),
  cheatDatabasePath: Schema.optional(
    RetroArchNullablePath("paths.cheatDatabasePath"),
  ),
  contentDatabasePath: Schema.optional(
    RetroArchNullablePath("paths.contentDatabasePath"),
  ),
  contentRuntimeLog: Schema.optional(Schema.Boolean),
  recordingOutputDirectory: Schema.optional(
    RetroArchNullablePath("paths.recordingOutputDirectory"),
  ),
})

const RetroArchVideoSyncPolicy = Schema.Struct({
  hardSync: Schema.optional(Schema.Boolean),
  hardSyncFrames: Schema.optional(
    NonNegativeInteger("video.sync.hardSyncFrames"),
  ),
  frameDelay: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 99, "video.sync.frameDelay")),
  ),
  frameDelayAuto: Schema.optional(Schema.Boolean),
})

const RetroArchVideoHdrPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  maxNits: Schema.optional(PositiveNumber("video.hdr.maxNits")),
  paperWhiteNits: Schema.optional(PositiveNumber("video.hdr.paperWhiteNits")),
  contrast: Schema.optional(PositiveNumber("video.hdr.contrast")),
  expandGamut: Schema.optional(Schema.Boolean),
})

const RetroArchVideoRecordingPolicy = Schema.Struct({
  postFilter: Schema.optional(Schema.Boolean),
  gpu: Schema.optional(Schema.Boolean),
})

const RetroArchVideoPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  windowedFullscreen: Schema.optional(Schema.Boolean),
  fullscreenWidth: Schema.optional(NonNegativeInteger("video.fullscreenWidth")),
  fullscreenHeight: Schema.optional(
    NonNegativeInteger("video.fullscreenHeight"),
  ),
  refreshRate: Schema.optional(PositiveNumber("video.refreshRate")),
  vsync: Schema.optional(Schema.Boolean),
  aspectRatio: Schema.optional(RetroArchAspectRatio),
  aspectRatioValue: Schema.optional(PositiveNumber("video.aspectRatioValue")),
  forceAspect: Schema.optional(Schema.Boolean),
  scale: Schema.optional(PositiveNumber("video.scale")),
  integerScale: Schema.optional(Schema.Boolean),
  cropOverscan: Schema.optional(Schema.Boolean),
  smooth: Schema.optional(Schema.Boolean),
  shader: Schema.optional(NullableNonEmptyString("video.shader")),
  shaderEnable: Schema.optional(Schema.Boolean),
  hdr: Schema.optional(RetroArchVideoHdrPolicy),
  recording: Schema.optional(RetroArchVideoRecordingPolicy),
  gpuScreenshot: Schema.optional(Schema.Boolean),
  shaderWatchFiles: Schema.optional(Schema.Boolean),
  sync: Schema.optional(RetroArchVideoSyncPolicy),
})

const RetroArchAudioPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  menuEnable: Schema.optional(Schema.Boolean),
  mute: Schema.optional(Schema.Boolean),
  mixerMute: Schema.optional(Schema.Boolean),
  latencyMs: Schema.optional(NonNegativeNumber("audio.latencyMs")),
  outputRate: Schema.optional(PositiveInteger("audio.outputRate")),
  device: Schema.optional(NullableNonEmptyString("audio.device")),
  sync: Schema.optional(Schema.Boolean),
  rateControl: Schema.optional(Schema.Boolean),
  rateControlDelta: Schema.optional(PositiveNumber("audio.rateControlDelta")),
  maxTimingSkew: Schema.optional(PositiveNumber("audio.maxTimingSkew")),
  volumeDb: Schema.optional(Schema.Number),
  mixerVolumeDb: Schema.optional(Schema.Number),
  resamplerQuality: Schema.optional(
    NonNegativeInteger("audio.resamplerQuality"),
  ),
})

const RetroArchExtraSettingKey = Schema.String.check(
  Schema.makeFilter(value => {
    if (!isRetroArchConfigKey(value)) {
      return `Invalid RetroArch extraSettings key: ${value}`
    }
    if (isRetroArchPlaintextCredentialSettingKey(value)) {
      return `RetroArch extraSettings must not contain plaintext credential key: ${value}`
    }
    return undefined
  }),
)
const RetroArchExtraSettings = Schema.Record(
  RetroArchExtraSettingKey,
  LaunchSettingValue,
)

const RetroArchInputPortKey = Schema.String.check(
  Schema.isPattern(/^[1-9][0-9]*$/),
)

const RetroArchInputOverlayPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  path: Schema.optional(NullableNonEmptyString("input.overlay.path")),
  opacity: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 1, "input.overlay.opacity")),
  ),
  scale: Schema.optional(PositiveNumber("input.overlay.scale")),
  behindMenu: Schema.optional(Schema.Boolean),
  hideInMenu: Schema.optional(Schema.Boolean),
})

const RetroArchInputDescriptorPolicy = Schema.Struct({
  labelShow: Schema.optional(Schema.Boolean),
  hideUnbound: Schema.optional(Schema.Boolean),
})

const RetroArchInputPortPolicy = Schema.Struct({
  libretroDevice: Schema.optional(
    NonNegativeInteger("input.ports.libretroDevice"),
  ),
  joypadIndex: Schema.optional(NonNegativeInteger("input.ports.joypadIndex")),
  analogDpadMode: Schema.optional(
    NonNegativeInteger("input.ports.analogDpadMode"),
  ),
})

const RetroArchInputPolicy = Schema.Struct({
  autodetect: Schema.optional(Schema.Boolean),
  maxUsers: Schema.optional(PositiveInteger("input.maxUsers")),
  pollTypeBehavior: Schema.optional(
    NonNegativeInteger("input.pollTypeBehavior"),
  ),
  axisThreshold: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 1, "input.axisThreshold")),
  ),
  analogDeadzone: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 1, "input.analogDeadzone")),
  ),
  analogSensitivity: Schema.optional(PositiveNumber("input.analogSensitivity")),
  remapBinds: Schema.optional(Schema.Boolean),
  descriptors: Schema.optional(RetroArchInputDescriptorPolicy),
  overlay: Schema.optional(RetroArchInputOverlayPolicy),
  autoGameFocus: Schema.optional(NonNegativeInteger("input.autoGameFocus")),
  menuToggleGamepadCombo: Schema.optional(RetroArchMenuToggleGamepadCombo),
  quitGamepadCombo: Schema.optional(RetroArchMenuToggleGamepadCombo),
  ports: Schema.optional(
    Schema.Record(RetroArchInputPortKey, RetroArchInputPortPolicy),
  ),
})

const RetroArchMenuPolicy = Schema.Struct({
  showStartScreen: Schema.optional(Schema.Boolean),
  pauseLibretro: Schema.optional(Schema.Boolean),
  mouseEnable: Schema.optional(Schema.Boolean),
  pointerEnable: Schema.optional(Schema.Boolean),
  timedateEnable: Schema.optional(Schema.Boolean),
  batteryLevelEnable: Schema.optional(Schema.Boolean),
  coreEnable: Schema.optional(Schema.Boolean),
  dynamicWallpaper: Schema.optional(Schema.Boolean),
  wallpaper: Schema.optional(NullableNonEmptyString("menu.wallpaper")),
  screensaverTimeoutSeconds: Schema.optional(
    NonNegativeInteger("menu.screensaverTimeoutSeconds"),
  ),
})

const RetroArchSavesPolicy = Schema.Struct({
  autosaveIntervalSeconds: Schema.optional(
    NonNegativeInteger("saves.autosaveIntervalSeconds"),
  ),
  autoLoadState: Schema.optional(Schema.Boolean),
  autoSaveState: Schema.optional(Schema.Boolean),
  autoIndex: Schema.optional(Schema.Boolean),
  maxKeep: Schema.optional(NonNegativeInteger("saves.maxKeep")),
  thumbnailEnable: Schema.optional(Schema.Boolean),
  sortSavefiles: Schema.optional(Schema.Boolean),
  sortSavestates: Schema.optional(Schema.Boolean),
  savefilesInContentDir: Schema.optional(Schema.Boolean),
  savestatesInContentDir: Schema.optional(Schema.Boolean),
  systemfilesInContentDir: Schema.optional(Schema.Boolean),
  blockSramOverwrite: Schema.optional(Schema.Boolean),
  saveFileCompression: Schema.optional(Schema.Boolean),
  stateFileCompression: Schema.optional(Schema.Boolean),
})

const RetroArchRewindPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  granularity: Schema.optional(PositiveInteger("rewind.granularity")),
  bufferSizeMb: Schema.optional(PositiveInteger("rewind.bufferSizeMb")),
  bufferSizeStepMb: Schema.optional(PositiveInteger("rewind.bufferSizeStepMb")),
  autoStride: Schema.optional(Schema.Boolean),
})

const RetroArchPlaybackPolicy = Schema.Struct({
  pauseNonactive: Schema.optional(Schema.Boolean),
  pauseOnDisconnect: Schema.optional(Schema.Boolean),
  slowmotionRatio: Schema.optional(PositiveNumber("playback.slowmotionRatio")),
  fastforwardRatio: Schema.optional(
    NonNegativeNumber("playback.fastforwardRatio"),
  ),
  fastforwardFrameskip: Schema.optional(Schema.Boolean),
})

const RetroArchRunAheadPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  frames: Schema.optional(NonNegativeInteger("latency.runAhead.frames")),
  secondaryInstance: Schema.optional(Schema.Boolean),
  hideWarnings: Schema.optional(Schema.Boolean),
})

const RetroArchPreemptiveFramesPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  frames: Schema.optional(
    NonNegativeInteger("latency.preemptiveFrames.frames"),
  ),
})

const RetroArchLatencyPolicy = Schema.Struct({
  runAhead: Schema.optional(RetroArchRunAheadPolicy),
  preemptiveFrames: Schema.optional(RetroArchPreemptiveFramesPolicy),
})

const RetroArchAchievementsPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  username: Schema.optional(NonEmptyString("achievements.username")),
  hardcoreMode: Schema.optional(Schema.Boolean),
  badges: Schema.optional(Schema.Boolean),
  richPresence: Schema.optional(Schema.Boolean),
  testUnofficial: Schema.optional(Schema.Boolean),
})

const RetroArchHapticsPolicy = Schema.Struct({
  vibrateOnKeypress: Schema.optional(Schema.Boolean),
  deviceVibration: Schema.optional(Schema.Boolean),
})

const RetroArchPlaylistsPolicy = Schema.Struct({
  useOldFormat: Schema.optional(Schema.Boolean),
})

const RetroArchPrivacyPolicy = Schema.Struct({
  cameraDevice: Schema.optional(NullableNonEmptyString("privacy.cameraDevice")),
  cameraAllow: Schema.optional(Schema.Boolean),
  locationAllow: Schema.optional(Schema.Boolean),
})

const RetroArchUpdaterPolicy = Schema.Struct({
  showOnlineUpdater: Schema.optional(Schema.Boolean),
  showCoreUpdater: Schema.optional(Schema.Boolean),
  buildbotUrl: Schema.optional(NullableHttpsUrl("updater.buildbotUrl")),
  buildbotAssetsUrl: Schema.optional(
    NullableHttpsUrl("updater.buildbotAssetsUrl"),
  ),
  autoExtractArchive: Schema.optional(Schema.Boolean),
})

/**
 * Minimal typed RetroArch v1 launch/config policy. Generated mode is the only
 * supported config-file mode in v1; user-authored config paths/default mode are
 * intentionally omitted so strict decode rejects them.
 */
export const RetroArchPolicy = Schema.Struct({
  environment: Schema.optional(EnvironmentOverlay),
  configFile: Schema.optional(RetroArchConfigFilePolicy),
  core: Schema.optional(RetroArchPathPolicy),
  content: Schema.optional(RetroArchPathPolicy),
  logging: Schema.optional(RetroArchLoggingPolicy),
  lifecycle: Schema.optional(RetroArchLifecyclePolicy),
  drivers: Schema.optional(RetroArchDriversPolicy),
  paths: Schema.optional(RetroArchPathsPolicy),
  video: Schema.optional(RetroArchVideoPolicy),
  audio: Schema.optional(RetroArchAudioPolicy),
  input: Schema.optional(RetroArchInputPolicy),
  menu: Schema.optional(RetroArchMenuPolicy),
  saves: Schema.optional(RetroArchSavesPolicy),
  rewind: Schema.optional(RetroArchRewindPolicy),
  playback: Schema.optional(RetroArchPlaybackPolicy),
  latency: Schema.optional(RetroArchLatencyPolicy),
  achievements: Schema.optional(RetroArchAchievementsPolicy),
  haptics: Schema.optional(RetroArchHapticsPolicy),
  playlists: Schema.optional(RetroArchPlaylistsPolicy),
  privacy: Schema.optional(RetroArchPrivacyPolicy),
  updater: Schema.optional(RetroArchUpdaterPolicy),
  extraSettings: Schema.optional(RetroArchExtraSettings),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
})
export type RetroArchPolicy = Schema.Schema.Type<typeof RetroArchPolicy>

const RetiredRetroArchPolicy = RetroArchPolicy.pipe(
  Schema.check(
    Schema.makeFilter(() => ({
      path: ["retroarch"],
      issue: "retroarch policy moved to plugin.@korri:retroarch",
    })),
  ),
)

const SteamStatePolicy = Schema.Struct({
  root: NonEmptyString("state.root"),
})

const SteamExtraPolicy = Schema.Struct({
  args: Schema.optional(Schema.Array(Schema.String)),
})

export const SteamPolicy = Schema.Struct({
  state: Schema.optional(SteamStatePolicy),
  extra: Schema.optional(SteamExtraPolicy),
  "launch-options": Schema.optional(NonEmptyString("launch-options")),
})
export type SteamPolicy = Schema.Schema.Type<typeof SteamPolicy>

export const InheritableLayer = Schema.Struct({
  launch: Schema.optional(LaunchPolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  retroarch: Schema.optional(RetiredRetroArchPolicy),
  plugin: Schema.optional(PluginPolicyMap),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type InheritableLayer = Schema.Schema.Type<typeof InheritableLayer>

export const ByLauncherPayload = Schema.Record(Schema.String, InheritableLayer)
export type ByLauncherPayload = Schema.Schema.Type<typeof ByLauncherPayload>

export const decodeRetroArchPolicy = (input: unknown): RetroArchPolicy =>
  Schema.decodeUnknownSync(RetroArchPolicy)(input, STRICT)

export const decodeSteamPolicy = (input: unknown): SteamPolicy =>
  Schema.decodeUnknownSync(SteamPolicy)(input, STRICT)

export const decodeMoonlightPolicy = (input: unknown): MoonlightPolicy =>
  Schema.decodeUnknownSync(MoonlightPolicy)(input, STRICT)

export const decodeInheritableLayer = (input: unknown): InheritableLayer =>
  Schema.decodeUnknownSync(InheritableLayer)(input, STRICT)

export const decodeByLauncherPayload = (input: unknown): ByLauncherPayload =>
  Schema.decodeUnknownSync(ByLauncherPayload)(input, STRICT)
