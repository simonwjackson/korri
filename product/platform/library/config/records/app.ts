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

const steamPolicyPayloadFromRecord = (payload: {
  readonly [key: string]: unknown
}): Record<string, unknown> => {
  const policy: Record<string, unknown> = {}
  for (const key of STEAM_APP_FIELD_KEYS) {
    if (payload[key] !== undefined) policy[key] = payload[key]
  }
  return policy
}

const isTypedAppPayload = (payload: {
  readonly id?: string
  readonly kind?: AppKind
  readonly settings?: unknown
  readonly [key: string]: unknown
}): string | undefined => {
  const kind = payload.kind
  const retiredRetroArchKey = RETROARCH_APP_FIELD_KEYS.find(
    key => payload[key] !== undefined,
  )
  if (retiredRetroArchKey) {
    return `RetroArch field ${retiredRetroArchKey} moved to plugin.@korri:retroarch`
  }
  const isSteam = kind === "steam"
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
  app.kind ?? "process"

export const isSteamAppRecord = (
  app: Pick<AppRecord, "id" | "kind">,
): boolean => appRecordKind(app) === "steam"

export const appSteamPolicyFromRecord = (
  app: AppRecord,
): SteamPolicy | undefined => {
  if (!isSteamAppRecord(app)) return undefined
  const policy = decodeSteamPolicy(steamPolicyPayloadFromRecord(app))
  return Object.keys(policy).length > 0 ? policy : undefined
}
