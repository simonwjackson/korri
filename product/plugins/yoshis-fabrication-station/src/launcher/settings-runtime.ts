export const NATIVE_YFS_VIEWPORT = { width: 832, height: 448 } as const

export type YfsViewportPolicy = "expand-only"
export type YfsZoomMode = "auto-area" | "fixed"

export interface YfsViewportSettings {
  readonly width?: number
  readonly height?: number
  readonly aspect?: string
  readonly policy?: YfsViewportPolicy
}

export interface YfsZoomSettings {
  readonly mode: YfsZoomMode
  readonly scale?: number
  readonly multiplier?: number
}

export interface YfsResolvedViewport {
  readonly width: number
  readonly height: number
}

export interface YfsLauncherSettings {
  readonly audio?: "on" | "off"
  readonly gbaSounds?: boolean
  readonly quickDeath?: boolean
  readonly playTimer?: boolean
  readonly bgmVolume?: number
  readonly sfxVolume?: number
  readonly debug?: boolean
  readonly metrics?: boolean
  readonly viewport?: YfsViewportSettings
  readonly zoom?: YfsZoomSettings
}

const SETTING_KEYS = new Set([
  "audio",
  "gbaSounds",
  "quickDeath",
  "playTimer",
  "bgmVolume",
  "sfxVolume",
  "debug",
  "metrics",
  "viewport",
  "zoom",
])

const VIEWPORT_KEYS = new Set(["width", "height", "aspect", "policy"])
const ZOOM_KEYS = new Set(["mode", "scale", "multiplier"])

function boolParam(value: boolean): string {
  return value ? "on" : "off"
}

function volume(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10
  )
    throw new Error(`${key} must be an integer 0..10`)
  return value as number
}

function booleanSetting(value: unknown, key: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "boolean") throw new Error(`${key} must be boolean`)
  return value
}

function boundedInteger(
  value: unknown,
  key: string,
  { min = 1, max = 8192 } = {},
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    throw new Error(`${key} must be an integer ${min}..${max}`)
  return value as number
}

function boundedScale(value: unknown, key: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 16
  )
    throw new Error(`${key} must be a finite number > 0 and <= 16`)
  return roundScale(value)
}

function parseAspect(aspect: string): number {
  const match = aspect.match(/^(\d{1,5}):(\d{1,5})$/)
  if (!match) throw new Error("viewport.aspect must be shaped like W:H")
  const width = Number(match[1])
  const height = Number(match[2])
  if (width <= 0 || height <= 0)
    throw new Error("viewport.aspect must be positive")
  return width / height
}

function normalizeViewport(value: unknown): YfsViewportSettings | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("viewport must be an object")
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!VIEWPORT_KEYS.has(key))
      throw new Error(`unknown viewport setting: ${key}`)
  }
  const hasWidth = record.width !== undefined
  const hasHeight = record.height !== undefined
  if (hasWidth !== hasHeight)
    throw new Error(
      "viewport.width and viewport.height must be provided together",
    )
  const aspect = record.aspect
  if (aspect !== undefined && typeof aspect !== "string")
    throw new Error("viewport.aspect must be a string")
  if (aspect !== undefined) parseAspect(aspect)
  if (aspect !== undefined && (hasWidth || hasHeight))
    throw new Error("viewport must use either aspect or explicit width/height")
  const policy =
    record.policy ?? (aspect !== undefined ? "expand-only" : undefined)
  if (policy !== undefined && policy !== "expand-only")
    throw new Error("viewport.policy must be expand-only")
  if (hasWidth) {
    const width = boundedInteger(record.width, "viewport.width")
    const height = boundedInteger(record.height, "viewport.height")
    return { width, height }
  }
  if (aspect !== undefined)
    return { aspect, policy: policy as YfsViewportPolicy }
  if (policy !== undefined)
    throw new Error("viewport.policy requires viewport.aspect")
  return undefined
}

function normalizeZoom(value: unknown): YfsZoomSettings | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("zoom must be an object")
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ZOOM_KEYS.has(key)) throw new Error(`unknown zoom setting: ${key}`)
  }
  const mode = record.mode ?? "auto-area"
  if (mode !== "auto-area" && mode !== "fixed")
    throw new Error("zoom.mode must be auto-area|fixed")
  if (mode === "fixed") {
    if (record.scale === undefined)
      throw new Error("zoom.scale is required for fixed zoom")
    if (record.multiplier !== undefined)
      throw new Error("zoom.multiplier is only valid for auto-area zoom")
    return { mode, scale: boundedScale(record.scale, "zoom.scale") }
  }
  if (record.scale !== undefined)
    throw new Error("zoom.scale is only valid for fixed zoom")
  const multiplier =
    record.multiplier === undefined
      ? undefined
      : boundedScale(record.multiplier, "zoom.multiplier")
  return { mode, ...(multiplier !== undefined ? { multiplier } : {}) }
}

export function normalizeYfsLauncherSettings(
  input: unknown,
): YfsLauncherSettings {
  if (input === undefined || input === null) return {}
  if (typeof input !== "object" || Array.isArray(input))
    throw new Error("YFS settings must be an object")
  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!SETTING_KEYS.has(key)) throw new Error(`unknown YFS setting: ${key}`)
  }
  const audio = record.audio
  if (audio !== undefined && audio !== "on" && audio !== "off")
    throw new Error("audio must be on|off")
  return {
    ...(audio !== undefined ? { audio } : {}),
    ...(record.gbaSounds !== undefined
      ? { gbaSounds: booleanSetting(record.gbaSounds, "gbaSounds") }
      : {}),
    ...(record.quickDeath !== undefined
      ? { quickDeath: booleanSetting(record.quickDeath, "quickDeath") }
      : {}),
    ...(record.playTimer !== undefined
      ? { playTimer: booleanSetting(record.playTimer, "playTimer") }
      : {}),
    ...(record.bgmVolume !== undefined
      ? { bgmVolume: volume(record.bgmVolume, "bgmVolume") }
      : {}),
    ...(record.sfxVolume !== undefined
      ? { sfxVolume: volume(record.sfxVolume, "sfxVolume") }
      : {}),
    ...(record.debug !== undefined
      ? { debug: booleanSetting(record.debug, "debug") }
      : {}),
    ...(record.metrics !== undefined
      ? { metrics: booleanSetting(record.metrics, "metrics") }
      : {}),
    ...(record.viewport !== undefined
      ? { viewport: normalizeViewport(record.viewport) }
      : {}),
    ...(record.zoom !== undefined ? { zoom: normalizeZoom(record.zoom) } : {}),
  } as YfsLauncherSettings
}

export function parseYfsSettingsJson(
  raw: string | undefined,
): YfsLauncherSettings {
  if (raw === undefined || raw.trim() === "") return {}
  try {
    return normalizeYfsLauncherSettings(JSON.parse(raw))
  } catch (error) {
    throw new Error(
      `KORRI_YFS_SETTINGS is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function resolveYfsViewport(
  settings: YfsLauncherSettings,
): YfsResolvedViewport {
  const viewport = settings.viewport
  if (!viewport) return NATIVE_YFS_VIEWPORT
  if (viewport.width !== undefined && viewport.height !== undefined)
    return { width: viewport.width, height: viewport.height }
  if (!viewport.aspect) return NATIVE_YFS_VIEWPORT

  const ratio = parseAspect(viewport.aspect)
  const nativeRatio = NATIVE_YFS_VIEWPORT.width / NATIVE_YFS_VIEWPORT.height
  if (ratio === nativeRatio) return NATIVE_YFS_VIEWPORT
  if ((viewport.policy ?? "expand-only") !== "expand-only")
    throw new Error("unsupported viewport policy")
  if (ratio < nativeRatio)
    return {
      width: NATIVE_YFS_VIEWPORT.width,
      height: Math.ceil(NATIVE_YFS_VIEWPORT.width / ratio),
    }
  return {
    width: Math.ceil(NATIVE_YFS_VIEWPORT.height * ratio),
    height: NATIVE_YFS_VIEWPORT.height,
  }
}

export function roundScale(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function resolveYfsZoomScale(settings: YfsLauncherSettings): number {
  const zoom = settings.zoom
  if (zoom?.mode === "fixed") return boundedScale(zoom.scale, "zoom.scale")
  const viewport = resolveYfsViewport(settings)
  const multiplier = zoom?.mode === "auto-area" ? (zoom.multiplier ?? 1) : 1
  return roundScale(
    Math.sqrt(
      (viewport.width * viewport.height) /
        (NATIVE_YFS_VIEWPORT.width * NATIVE_YFS_VIEWPORT.height),
    ) * multiplier,
  )
}

export function yfsSettingsQuery(
  settings: YfsLauncherSettings,
): URLSearchParams {
  const params = new URLSearchParams()
  if (settings.audio) params.set("audio", settings.audio)
  if (settings.gbaSounds !== undefined)
    params.set("gba_sounds", boolParam(settings.gbaSounds))
  if (settings.quickDeath !== undefined)
    params.set("quick_death", boolParam(settings.quickDeath))
  if (settings.playTimer !== undefined)
    params.set("play_timer", boolParam(settings.playTimer))
  if (settings.bgmVolume !== undefined)
    params.set("bgm_volume", String(settings.bgmVolume))
  if (settings.sfxVolume !== undefined)
    params.set("sfx_volume", String(settings.sfxVolume))
  if (settings.debug === true) params.set("debug", "1")
  if (settings.metrics === true) params.set("metrics", "1")
  if (settings.viewport) {
    const viewport = resolveYfsViewport(settings)
    params.set("viewport_width", String(viewport.width))
    params.set("viewport_height", String(viewport.height))
  }
  if (settings.zoom || settings.viewport) {
    const mode = settings.zoom?.mode ?? "auto-area"
    params.set("zoom_mode", mode === "auto-area" ? "auto_area" : mode)
    params.set("zoom_scale", String(resolveYfsZoomScale(settings)))
    if (
      settings.zoom?.mode === "auto-area" &&
      settings.zoom.multiplier !== undefined
    )
      params.set("zoom_multiplier", String(settings.zoom.multiplier))
  }
  return params
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  return value
}

export function stableSettingsKey(settings: YfsLauncherSettings): string {
  return JSON.stringify(stableValue(settings))
}
