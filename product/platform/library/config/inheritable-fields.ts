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
 * - `gamescope`          → deep merge per nested key; scalars last-wins
 * - `gamescope.extraArgs`→ list concat in inheritance order (least→most specific)
 * - `gamescope.command`  → scalar; more-specific wrapper command wins
 * - `moonlight`          → deep merge per nested key; scalars last-wins
 * - `moonlight.input.devices` / `moonlight.extraArgs`
 *                         → list concat in inheritance order
 * - `moonlight.environment`
 *                         → map merge; `null` means executable env unset
 * - `retroarch`          → deep merge per nested key; scalars last-wins
 * - `retroarch.environment` / `retroarch.extraSettings`
 *                         → map merge; environment `null` means env unset
 * - `retroarch.extraArgs` / `retroarch.configFile.append`
 *                         → list concat in inheritance order
 * - `env`                → map merge per key; more-specific wins
 * - `cwd`                → scalar; most-specific path wins
 * - `argsAppend`         → list concat in inheritance order
 * - `patches`            → list concat in inheritance order
 * - `byLauncher[L]`      → merged when the resolved launcher equals L
 */

import { Schema } from "effect"

import { LaunchSettings } from "./launch-block"

const STRICT = { onExcessProperty: "error" } as const

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

/**
 * Gamescope 3.16.x backend names accepted by `--backend` in Korri's pinned
 * package lane. Compile-time feature flags can disable some upstream choices at
 * the binary level, but the readable contract models the shipped option surface.
 */
export const GamescopeBackend = Schema.Literals([
  "auto",
  "drm",
  "sdl",
  "openvr",
  "headless",
  "wayland",
])
export type GamescopeBackend = Schema.Schema.Type<typeof GamescopeBackend>

export const GamescopeScaler = Schema.Literals([
  "auto",
  "integer",
  "fit",
  "fill",
  "stretch",
])
export type GamescopeScaler = Schema.Schema.Type<typeof GamescopeScaler>

export const GamescopeFilter = Schema.Literals([
  "linear",
  "nearest",
  "fsr",
  "nis",
  "pixel",
])
export type GamescopeFilter = Schema.Schema.Type<typeof GamescopeFilter>

export const GamescopeOrientation = Schema.Literals([
  "normal",
  "right",
  "left",
  "upsidedown",
])
export type GamescopeOrientation = Schema.Schema.Type<
  typeof GamescopeOrientation
>

export const GamescopeGenerateDrmMode = Schema.Literals(["cvt", "fixed"])
export type GamescopeGenerateDrmMode = Schema.Schema.Type<
  typeof GamescopeGenerateDrmMode
>

export const GamescopeVirtualConnectorStrategy = Schema.Literals([
  "SingleApplication",
  "SteamControlled",
  "PerAppId",
  "PerWindow",
])
export type GamescopeVirtualConnectorStrategy = Schema.Schema.Type<
  typeof GamescopeVirtualConnectorStrategy
>

export const GamescopeTouchMode = Schema.Union([
  Schema.Literal(0),
  Schema.Literal(1),
  Schema.Literal(2),
  Schema.Literal(3),
  Schema.Literal(4),
])
export type GamescopeTouchMode = Schema.Schema.Type<typeof GamescopeTouchMode>

const GamescopeBackendPolicy = Schema.Struct({
  type: Schema.optional(GamescopeBackend),
  allowDeferred: Schema.optional(Schema.Boolean),
  preferVkDevice: Schema.optional(Schema.String),
})

const GamescopeWindowPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  borderless: Schema.optional(Schema.Boolean),
  grabKeyboard: Schema.optional(Schema.Boolean),
  forceGrabCursor: Schema.optional(Schema.Boolean),
  displayIndex: Schema.optional(NonNegativeInteger("displayIndex")),
  forceWindowsFullscreen: Schema.optional(Schema.Boolean),
  exposeWayland: Schema.optional(Schema.Boolean),
  xwaylandCount: Schema.optional(PositiveInteger("xwaylandCount")),
  fadeOutDuration: Schema.optional(NonNegativeNumber("fadeOutDuration")),
})

const GamescopeOutputPolicy = Schema.Struct({
  width: Schema.optional(PositiveNumber("output.width")),
  height: Schema.optional(PositiveNumber("output.height")),
  preferredConnectors: Schema.optional(Schema.Array(Schema.String)),
})

const GamescopeNestedPolicy = Schema.Struct({
  width: Schema.optional(PositiveNumber("nested.width")),
  height: Schema.optional(PositiveNumber("nested.height")),
  refresh: Schema.optional(PositiveNumber("nested.refresh")),
  unfocusedRefresh: Schema.optional(PositiveNumber("nested.unfocusedRefresh")),
})

const GamescopeDisplayPolicy = Schema.Struct({
  output: Schema.optional(GamescopeOutputPolicy),
  nested: Schema.optional(GamescopeNestedPolicy),
  scale: Schema.optional(
    Schema.Struct({ max: Schema.optional(PositiveNumber("scale.max")) }),
  ),
  orientation: Schema.optional(GamescopeOrientation),
  adaptiveSync: Schema.optional(Schema.Boolean),
  framerateLimit: Schema.optional(NonNegativeNumber("framerateLimit")),
})

const GamescopeScalingPolicy = Schema.Struct({
  scaler: Schema.optional(GamescopeScaler),
  filter: Schema.optional(GamescopeFilter),
  sharpness: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 20, "sharpness")),
  ),
})

const GamescopeCursorPolicy = Schema.Struct({
  image: Schema.optional(Schema.String),
  hotspot: Schema.optional(Schema.String),
  hideDelay: Schema.optional(NonNegativeNumber("hideDelay")),
  scaleHeight: Schema.optional(PositiveNumber("scaleHeight")),
})

const GamescopeInputPolicy = Schema.Struct({
  mouseSensitivity: Schema.optional(PositiveNumber("mouseSensitivity")),
  defaultTouchMode: Schema.optional(GamescopeTouchMode),
})

const GamescopeSchedulingPolicy = Schema.Struct({
  realtime: Schema.optional(Schema.Boolean),
  readyFd: Schema.optional(NonNegativeInteger("readyFd")),
  keepAlive: Schema.optional(Schema.Boolean),
})

const GamescopeStatsPolicy = Schema.Struct({
  path: Schema.optional(Schema.String),
})

const GamescopeSteamPolicy = Schema.Struct({
  enableIntegration: Schema.optional(Schema.Boolean),
  mangoapp: Schema.optional(Schema.Boolean),
})

const GamescopeEmbeddedPolicy = Schema.Struct({
  generateDrmMode: Schema.optional(GamescopeGenerateDrmMode),
  immediateFlips: Schema.optional(Schema.Boolean),
  virtualConnectorStrategy: Schema.optional(GamescopeVirtualConnectorStrategy),
})

const GamescopeHdrPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  sdrGamutWideness: Schema.optional(
    Schema.Number.check(finiteNumberRange(0, 1, "sdrGamutWideness")),
  ),
  sdrContentNits: Schema.optional(PositiveNumber("sdrContentNits")),
  inverseToneMapping: Schema.optional(
    Schema.Struct({
      enable: Schema.optional(Schema.Boolean),
      sdrNits: Schema.optional(
        Schema.Number.check(finiteNumberRange(0, 1000, "sdrNits")),
      ),
      targetNits: Schema.optional(
        Schema.Number.check(finiteNumberRange(0, 10000, "targetNits")),
      ),
    }),
  ),
  debug: Schema.optional(
    Schema.Struct({
      forceSupport: Schema.optional(Schema.Boolean),
      forceOutput: Schema.optional(Schema.Boolean),
      heatmap: Schema.optional(Schema.Boolean),
    }),
  ),
})

const GamescopeVrPolicy = Schema.Struct({
  overlayKey: Schema.optional(Schema.String),
  appOverlayKey: Schema.optional(Schema.String),
  explicitName: Schema.optional(Schema.String),
  defaultName: Schema.optional(Schema.String),
  icon: Schema.optional(Schema.String),
  showImmediately: Schema.optional(Schema.Boolean),
  modal: Schema.optional(Schema.Boolean),
  physicalWidth: Schema.optional(PositiveNumber("physicalWidth")),
  physicalCurvature: Schema.optional(NonNegativeNumber("physicalCurvature")),
  physicalPreCurvePitch: Schema.optional(Schema.Number),
  scrollSpeed: Schema.optional(PositiveNumber("scrollSpeed")),
  sessionManager: Schema.optional(Schema.Boolean),
  controlBar: Schema.optional(
    Schema.Struct({
      enable: Schema.optional(Schema.Boolean),
      keyboard: Schema.optional(Schema.Boolean),
      close: Schema.optional(Schema.Boolean),
    }),
  ),
  clickStabilization: Schema.optional(Schema.Boolean),
})

const GamescopeReshadePolicy = Schema.Struct({
  effect: Schema.optional(Schema.String),
  techniqueIndex: Schema.optional(NonNegativeInteger("techniqueIndex")),
})

const GamescopeSteamDeckPolicy = Schema.Struct({
  muraMap: Schema.optional(Schema.String),
})

const GamescopeDebugPolicy = Schema.Struct({
  disableLayers: Schema.optional(Schema.Boolean),
  layers: Schema.optional(Schema.Boolean),
  focus: Schema.optional(Schema.Boolean),
  synchronousX11: Schema.optional(Schema.Boolean),
  hud: Schema.optional(Schema.Boolean),
  events: Schema.optional(Schema.Boolean),
  forceComposition: Schema.optional(Schema.Boolean),
  compositeMarkers: Schema.optional(Schema.Boolean),
  disableColorManagement: Schema.optional(Schema.Boolean),
  disableXres: Schema.optional(Schema.Boolean),
})

const GamescopeAppPolicy = Schema.Struct({
  environment: Schema.optional(EnvironmentOverlay),
})

/**
 * Breaking, typed Gamescope launch policy. Old flat fields (`enabled`, flat
 * `backend`, `exposeWayland`, `args`, `forceXwayland`) are intentionally not
 * accepted; `extraArgs` is the only raw-argv escape hatch.
 */
export const GamescopePolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  command: Schema.optional(Schema.String),
  environment: Schema.optional(EnvironmentOverlay),
  app: Schema.optional(GamescopeAppPolicy),
  backend: Schema.optional(GamescopeBackendPolicy),
  window: Schema.optional(GamescopeWindowPolicy),
  display: Schema.optional(GamescopeDisplayPolicy),
  scaling: Schema.optional(GamescopeScalingPolicy),
  cursor: Schema.optional(GamescopeCursorPolicy),
  input: Schema.optional(GamescopeInputPolicy),
  scheduling: Schema.optional(GamescopeSchedulingPolicy),
  stats: Schema.optional(GamescopeStatsPolicy),
  steam: Schema.optional(GamescopeSteamPolicy),
  embedded: Schema.optional(GamescopeEmbeddedPolicy),
  hdr: Schema.optional(GamescopeHdrPolicy),
  vr: Schema.optional(GamescopeVrPolicy),
  reshade: Schema.optional(GamescopeReshadePolicy),
  steamDeck: Schema.optional(GamescopeSteamDeckPolicy),
  debug: Schema.optional(GamescopeDebugPolicy),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
})
export type GamescopePolicy = Schema.Schema.Type<typeof GamescopePolicy>

const NullablePositiveInteger = (label: string) =>
  Schema.NullOr(PositiveInteger(label))

const NullableNonEmptyString = (label: string) =>
  Schema.NullOr(NonEmptyString(label))

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

export const RetroArchAspectRatio = Schema.Literals(["core-provided"])
export type RetroArchAspectRatio = Schema.Schema.Type<
  typeof RetroArchAspectRatio
>

export const RetroArchMenuToggleGamepadCombo = Schema.Literals(["start-select"])
export type RetroArchMenuToggleGamepadCombo = Schema.Schema.Type<
  typeof RetroArchMenuToggleGamepadCombo
>

const RetroArchConfigFilePolicy = Schema.Struct({
  mode: Schema.optional(Schema.Literal("generated")),
  append: Schema.optional(Schema.Array(NonEmptyString("configFile.append[]"))),
})

const RetroArchPathPolicy = Schema.Struct({
  path: Schema.optional(NonEmptyString("path")),
})

const RetroArchLoggingPolicy = Schema.Struct({
  verbose: Schema.optional(Schema.Boolean),
  logFile: Schema.optional(NullableNonEmptyString("logging.logFile")),
})

const RetroArchLifecyclePolicy = Schema.Struct({
  saveOnExit: Schema.optional(Schema.Boolean),
  autoOverrides: Schema.optional(Schema.Boolean),
  autoRemaps: Schema.optional(Schema.Boolean),
  gameSpecificOptions: Schema.optional(Schema.Boolean),
  autoShaders: Schema.optional(Schema.Boolean),
})

const RetroArchPathsPolicy = Schema.Struct({
  systemDirectory: Schema.optional(NonEmptyString("paths.systemDirectory")),
  savefileDirectory: Schema.optional(NonEmptyString("paths.savefileDirectory")),
  savestateDirectory: Schema.optional(
    NonEmptyString("paths.savestateDirectory"),
  ),
  screenshotDirectory: Schema.optional(
    NonEmptyString("paths.screenshotDirectory"),
  ),
})

const RetroArchVideoPolicy = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  windowedFullscreen: Schema.optional(Schema.Boolean),
  vsync: Schema.optional(Schema.Boolean),
  aspectRatio: Schema.optional(RetroArchAspectRatio),
})

const RetroArchAudioPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  latencyMs: Schema.optional(NonNegativeNumber("audio.latencyMs")),
})

const RetroArchInputPolicy = Schema.Struct({
  autodetect: Schema.optional(Schema.Boolean),
  maxUsers: Schema.optional(PositiveInteger("input.maxUsers")),
  menuToggleGamepadCombo: Schema.optional(RetroArchMenuToggleGamepadCombo),
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
  paths: Schema.optional(RetroArchPathsPolicy),
  video: Schema.optional(RetroArchVideoPolicy),
  audio: Schema.optional(RetroArchAudioPolicy),
  input: Schema.optional(RetroArchInputPolicy),
  extraSettings: Schema.optional(LaunchSettings),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
})
export type RetroArchPolicy = Schema.Schema.Type<typeof RetroArchPolicy>

export const decodeRetroArchPolicy = (input: unknown): RetroArchPolicy =>
  Schema.decodeUnknownSync(RetroArchPolicy)(input, STRICT)

/**
 * Floor of the gamescope policy cascade. Production deployments run
 * gamescope nested under a parent Wayland compositor (sway on kiosks,
 * source-machine hosts); both the Wayland backend and exposing the child
 * Wayland socket are the right defaults there. Override per game/launcher in
 * YAML for standalone-DRM setups.
 */
export const DEFAULT_GAMESCOPE_POLICY: GamescopePolicy = {
  enable: true,
  backend: { type: "wayland" },
  window: {
    fullscreen: true,
    borderless: true,
    exposeWayland: true,
  },
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergeDefaults = <T>(base: T, override: T | undefined): T => {
  if (override === undefined) return base
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      merged[key] = mergeDefaults(merged[key], value)
    }
    return merged as T
  }
  return override
}

export const normalizeGamescopePolicy = (
  policy: GamescopePolicy | undefined,
): GamescopePolicy => {
  const source = policy ?? {}
  if (source.enable === false) return source
  return mergeDefaults(DEFAULT_GAMESCOPE_POLICY, source)
}

/**
 * The set of inheritable behavior fields shared by every layer-bearing
 * record. Identity fields (`system`, `contentPath`) are NOT here — they
 * live on `GamePayload` only.
 *
 * Future `cpu` and `hooks` slots are reserved by adding them here; the
 * cascade merge rules don't change.
 */
export const InheritableLayer = Schema.Struct({
  gamescope: Schema.optional(GamescopePolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  retroarch: Schema.optional(RetroArchPolicy),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type InheritableLayer = Schema.Schema.Type<typeof InheritableLayer>

/**
 * `byLauncher: Record<launcherId, InheritableLayer>` — scoped contributions
 * keyed by launcher id. At cascade time, only the entry matching the
 * resolved launcher contributes; the others are ignored.
 */
export const ByLauncherPayload = Schema.Record(Schema.String, InheritableLayer)
export type ByLauncherPayload = Schema.Schema.Type<typeof ByLauncherPayload>

export const decodeGamescopePolicy = (input: unknown): GamescopePolicy =>
  Schema.decodeUnknownSync(GamescopePolicy)(input, STRICT)

export const decodeMoonlightPolicy = (input: unknown): MoonlightPolicy =>
  Schema.decodeUnknownSync(MoonlightPolicy)(input, STRICT)

export const decodeInheritableLayer = (input: unknown): InheritableLayer =>
  Schema.decodeUnknownSync(InheritableLayer)(input, STRICT)

export const decodeByLauncherPayload = (input: unknown): ByLauncherPayload =>
  Schema.decodeUnknownSync(ByLauncherPayload)(input, STRICT)
