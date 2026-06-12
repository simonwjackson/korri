import { Schema } from "effect"

import {
  decodeRyubingPolicy,
  decodeSteamPolicy,
  InheritableLayer,
  RetroArchPolicy,
  RyubingPolicy,
  SteamPolicy,
} from "../inheritable-fields"
import { LaunchSettings } from "../launch-block"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "app values must be non-empty",
    }),
  ),
)

export const AppKind = Schema.Literals([
  "retroarch",
  "mame",
  "dolphin",
  "solarus",
  "process",
  "generic-process",
  "ryubing",
  "steam",
])
export type AppKind = Schema.Schema.Type<typeof AppKind>

const RyubingFlatAppFields = {
  state: RyubingPolicy.fields.state,
  config: RyubingPolicy.fields.config,
  // These group names intentionally overlap with flat RetroArch app fields.
  // Flat app decoding accepts either shape, then kind-specific filters below
  // reject misplaced vocabulary.
  content: Schema.optional(Schema.Unknown),
  display: RyubingPolicy.fields.display,
  graphics: RyubingPolicy.fields.graphics,
  console: RyubingPolicy.fields.console,
  audio: Schema.optional(Schema.Unknown),
  input: Schema.optional(Schema.Unknown),
  network: RyubingPolicy.fields.network,
  logging: Schema.optional(Schema.Unknown),
  debug: RyubingPolicy.fields.debug,
  extra: RyubingPolicy.fields.extra,
}

export const RYUBING_APP_FIELD_KEYS = [
  "state",
  "config",
  "content",
  "display",
  "graphics",
  "console",
  "audio",
  "input",
  "network",
  "logging",
  "debug",
  "extra",
] as const

export const STEAM_APP_FIELD_KEYS = [
  "state",
  "extra",
  "launch-options",
] as const

export const RETROARCH_APP_FIELD_KEYS = [
  "environment",
  "configFile",
  "core",
  "content",
  "logging",
  "lifecycle",
  "drivers",
  "paths",
  "video",
  "audio",
  "input",
  "menu",
  "saves",
  "rewind",
  "playback",
  "latency",
  "achievements",
  "haptics",
  "playlists",
  "privacy",
  "updater",
  "extraSettings",
  "extraArgs",
] as const

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasAnyKey = (value: unknown, keys: readonly string[]): boolean =>
  isPlainRecord(value) && keys.some(key => value[key] !== undefined)

const ryubingPolicyPayloadFromRecord = (payload: {
  readonly [key: string]: unknown
}): Record<string, unknown> => {
  const policy: Record<string, unknown> = {}
  for (const key of [...RYUBING_APP_FIELD_KEYS, "env"] as const) {
    if (payload[key] !== undefined) policy[key] = payload[key]
  }
  return policy
}

const steamPolicyPayloadFromRecord = (payload: {
  readonly [key: string]: unknown
}): Record<string, unknown> => {
  const policy: Record<string, unknown> = {}
  for (const key of STEAM_APP_FIELD_KEYS) {
    if (payload[key] !== undefined) policy[key] = payload[key]
  }
  return policy
}

const RYUBING_OVERLAP_MARKERS: Readonly<Record<string, readonly string[]>> = {
  content: ["game-dirs", "autoload-dirs", "shown-file-types"],
  audio: ["backend", "volume"],
  input: ["require-config", "global-config", "controllers", "hotkeys"],
  logging: ["file", "levels", "filtered-classes"],
}

const RETROARCH_OVERLAP_MARKERS: Readonly<Record<string, readonly string[]>> = {
  content: ["path"],
  audio: ["enable", "latencyMs", "outputRate", "volumeDb"],
  input: ["autodetect", "maxUsers", "ports", "overlay"],
  logging: ["verbose", "verbosity", "fpsShow", "logFile"],
}

const isTypedAppPayload = (payload: {
  readonly id?: string
  readonly kind?: AppKind
  readonly settings?: unknown
  readonly [key: string]: unknown
}): string | undefined => {
  const kind =
    payload.kind ?? (payload.id === "retroarch" ? "retroarch" : undefined)
  const isRetroArch = kind === "retroarch"
  const isRyubing = kind === "ryubing"
  const isSteam = kind === "steam"
  if (isRetroArch && payload.settings !== undefined) {
    return "RetroArch apps use typed fields and extraSettings, not raw settings"
  }
  if (!isRetroArch) {
    const misplacedKey = RETROARCH_APP_FIELD_KEYS.find(key => {
      if (payload[key] === undefined) return false
      const overlapMarkers = RETROARCH_OVERLAP_MARKERS[key]
      return overlapMarkers
        ? hasAnyKey(payload[key], overlapMarkers)
        : !(RYUBING_APP_FIELD_KEYS as readonly string[]).includes(key)
    })
    if (misplacedKey) {
      return `RetroArch field ${misplacedKey} requires kind: retroarch`
    }
  }
  if (!isRyubing && !isSteam) {
    const misplacedKey = RYUBING_APP_FIELD_KEYS.find(key => {
      if (payload[key] === undefined) return false
      const overlapMarkers = RYUBING_OVERLAP_MARKERS[key]
      return overlapMarkers ? hasAnyKey(payload[key], overlapMarkers) : true
    })
    if (misplacedKey) {
      return `Ryubing field ${misplacedKey} requires kind: ryubing`
    }
  }
  if (!isSteam && payload["launch-options"] !== undefined) {
    return "Steam field launch-options requires kind: steam"
  }
  if (isRyubing) {
    if (payload["launch-options"] !== undefined) {
      return "Steam field launch-options is not valid on kind: ryubing"
    }
    const misplacedKey = RETROARCH_APP_FIELD_KEYS.find(key => {
      if (payload[key] === undefined) return false
      const overlapMarkers = RETROARCH_OVERLAP_MARKERS[key]
      return overlapMarkers
        ? hasAnyKey(payload[key], overlapMarkers)
        : !(RYUBING_APP_FIELD_KEYS as readonly string[]).includes(key)
    })
    if (misplacedKey) {
      return `RetroArch field ${misplacedKey} is not valid on kind: ryubing`
    }
    try {
      decodeRyubingPolicy(ryubingPolicyPayloadFromRecord(payload))
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  if (isSteam) {
    const misplacedRyubingKey = RYUBING_APP_FIELD_KEYS.find(key => {
      if (key === "state" || key === "extra") return false
      if (payload[key] === undefined) return false
      const overlapMarkers = RYUBING_OVERLAP_MARKERS[key]
      return overlapMarkers ? hasAnyKey(payload[key], overlapMarkers) : true
    })
    if (misplacedRyubingKey) {
      return `Ryubing field ${misplacedRyubingKey} is not valid on kind: steam`
    }
    if (
      !isPlainRecord(payload.state) ||
      typeof payload.state.root !== "string"
    ) {
      return "Steam apps require state.root"
    }
    try {
      decodeSteamPolicy(steamPolicyPayloadFromRecord(payload))
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  return undefined
}

const AppPayloadBase = Schema.Struct({
  settings: Schema.optional(LaunchSettings),
  kind: Schema.optional(AppKind),

  // Optional executable shape for custom apps or built-in overrides.
  command: Schema.optional(NonEmptyString),
  runtime: Schema.optional(NonEmptyString),
  args: Schema.optional(Schema.Array(Schema.String)),
  systems: Schema.optional(Schema.Array(Schema.String)),
  policy: Schema.optional(
    Schema.Struct({
      allowedCommands: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),

  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  ...RetroArchPolicy.fields,
  ...RyubingFlatAppFields,
  "launch-options": SteamPolicy.fields["launch-options"],
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})

export const AppPayload = AppPayloadBase.check(
  Schema.makeFilter(isTypedAppPayload),
)
export type AppPayload = Schema.Schema.Type<typeof AppPayload>

export const AppRecord = Schema.Struct({
  id: NonEmptyString,
  ...AppPayloadBase.fields,
}).check(Schema.makeFilter(isTypedAppPayload))
export type AppRecord = Schema.Schema.Type<typeof AppRecord>

export const decodeAppPayload = (input: unknown): AppPayload =>
  Schema.decodeUnknownSync(AppPayload)(input, STRICT)

export const decodeAppRecord = (input: unknown): AppRecord =>
  Schema.decodeUnknownSync(AppRecord)(input, STRICT)

export const appRecordKind = (app: Pick<AppRecord, "id" | "kind">): AppKind =>
  app.kind ?? (app.id === "retroarch" ? "retroarch" : "process")

export const isRetroArchAppRecord = (
  app: Pick<AppRecord, "id" | "kind">,
): boolean => appRecordKind(app) === "retroarch"

export const isRyubingAppRecord = (
  app: Pick<AppRecord, "id" | "kind">,
): boolean => appRecordKind(app) === "ryubing"

export const isSteamAppRecord = (
  app: Pick<AppRecord, "id" | "kind">,
): boolean => appRecordKind(app) === "steam"

export const appRetroArchPolicyFromRecord = (
  app: AppRecord,
): RetroArchPolicy | undefined => {
  if (!isRetroArchAppRecord(app)) return undefined
  const {
    environment,
    configFile,
    core,
    content,
    logging,
    lifecycle,
    drivers,
    paths,
    video,
    audio,
    input,
    menu,
    saves,
    rewind,
    playback,
    latency,
    achievements,
    haptics,
    playlists,
    privacy,
    updater,
    extraSettings,
    extraArgs,
  } = app
  const policy: RetroArchPolicy = {
    ...(environment !== undefined ? { environment } : {}),
    ...(configFile !== undefined ? { configFile } : {}),
    ...(core !== undefined ? { core } : {}),
    ...(content !== undefined
      ? { content: content as RetroArchPolicy["content"] }
      : {}),
    ...(logging !== undefined
      ? { logging: logging as RetroArchPolicy["logging"] }
      : {}),
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    ...(drivers !== undefined ? { drivers } : {}),
    ...(paths !== undefined ? { paths } : {}),
    ...(video !== undefined ? { video } : {}),
    ...(audio !== undefined
      ? { audio: audio as RetroArchPolicy["audio"] }
      : {}),
    ...(input !== undefined
      ? { input: input as RetroArchPolicy["input"] }
      : {}),
    ...(menu !== undefined ? { menu } : {}),
    ...(saves !== undefined ? { saves } : {}),
    ...(rewind !== undefined ? { rewind } : {}),
    ...(playback !== undefined ? { playback } : {}),
    ...(latency !== undefined ? { latency } : {}),
    ...(achievements !== undefined ? { achievements } : {}),
    ...(haptics !== undefined ? { haptics } : {}),
    ...(playlists !== undefined ? { playlists } : {}),
    ...(privacy !== undefined ? { privacy } : {}),
    ...(updater !== undefined ? { updater } : {}),
    ...(extraSettings !== undefined ? { extraSettings } : {}),
    ...(extraArgs !== undefined ? { extraArgs } : {}),
  }
  return Object.keys(policy).length > 0 ? policy : undefined
}

export const appRyubingPolicyFromRecord = (
  app: AppRecord,
): RyubingPolicy | undefined => {
  if (!isRyubingAppRecord(app)) return undefined
  const policy = decodeRyubingPolicy(ryubingPolicyPayloadFromRecord(app))
  return Object.keys(policy).length > 0 ? policy : undefined
}

export const appSteamPolicyFromRecord = (
  app: AppRecord,
): SteamPolicy | undefined => {
  if (!isSteamAppRecord(app)) return undefined
  const policy = decodeSteamPolicy(steamPolicyPayloadFromRecord(app))
  return Object.keys(policy).length > 0 ? policy : undefined
}
