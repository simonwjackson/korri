import { Schema } from "effect"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "../plugin"

const STRICT = { onExcessProperty: "error" } as const

const EnvironmentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
)

const EnvironmentOverlay = Schema.Record(
  EnvironmentKey,
  Schema.NullOr(Schema.String),
)
export type EnvironmentOverlay = Schema.Schema.Type<typeof EnvironmentOverlay>

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

const PositiveNumber = (label: string) =>
  Schema.Number.check(positiveNumber(label))
const NonNegativeNumber = (label: string) =>
  Schema.Number.check(nonNegativeNumber(label))
const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))
const NonNegativeInteger = (label: string) =>
  Schema.Int.check(nonNegativeNumber(label))

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

export const decodeGamescopePolicy = (input: unknown): GamescopePolicy =>
  Schema.decodeUnknownSync(GamescopePolicy)(input, STRICT)

export const gamescopePolicyFromLaunch = (layer: {
  readonly launch?: {
    readonly with?: Partial<Record<string, GamescopePolicy | undefined>>
  }
}): GamescopePolicy | undefined =>
  layer.launch?.with?.[KORRI_GAMESCOPE_PLUGIN_ID]
