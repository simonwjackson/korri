import { Schema } from "effect"

import {
  decodeSteamPolicy,
  InheritableLayer,
  RetroArchPolicy,
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

export const AppKind = NonEmptyString
export type AppKind = Schema.Schema.Type<typeof AppKind>

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

const steamPolicyPayloadFromRecord = (payload: {
  readonly [key: string]: unknown
}): Record<string, unknown> => {
  const policy: Record<string, unknown> = {}
  for (const key of STEAM_APP_FIELD_KEYS) {
    if (payload[key] !== undefined) policy[key] = payload[key]
  }
  return policy
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
  const isSteam = kind === "steam"
  if (isRetroArch && payload.settings !== undefined) {
    return "RetroArch apps use typed fields and extraSettings, not raw settings"
  }
  if (!isRetroArch) {
    const misplacedKey = RETROARCH_APP_FIELD_KEYS.find(key => {
      if (payload[key] === undefined) return false
      const overlapMarkers = RETROARCH_OVERLAP_MARKERS[key]
      return overlapMarkers ? hasAnyKey(payload[key], overlapMarkers) : true
    })
    if (misplacedKey) {
      return `RetroArch field ${misplacedKey} requires kind: retroarch`
    }
  }
  if (!isSteam && payload["launch-options"] !== undefined) {
    return "Steam field launch-options requires kind: steam"
  }
  if (isSteam) {
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

  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  ...RetroArchPolicy.fields,
  state: SteamPolicy.fields.state,
  extra: SteamPolicy.fields.extra,
  "launch-options": SteamPolicy.fields["launch-options"],
  plugin: InheritableLayer.fields.plugin,
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

export const appSteamPolicyFromRecord = (
  app: AppRecord,
): SteamPolicy | undefined => {
  if (!isSteamAppRecord(app)) return undefined
  const policy = decodeSteamPolicy(steamPolicyPayloadFromRecord(app))
  return Object.keys(policy).length > 0 ? policy : undefined
}
