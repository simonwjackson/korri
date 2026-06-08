import { Schema } from "effect"

import { InheritableLayer, RetroArchPolicy } from "../inheritable-fields"
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
])
export type AppKind = Schema.Schema.Type<typeof AppKind>

const RETROARCH_APP_FIELD_KEYS = [
  "environment",
  "configFile",
  "core",
  "content",
  "logging",
  "lifecycle",
  "paths",
  "video",
  "audio",
  "input",
  "extraSettings",
  "extraArgs",
] as const

const isTypedRetroArchPayload = (payload: {
  readonly id?: string
  readonly kind?: AppKind
  readonly settings?: unknown
  readonly [key: string]: unknown
}): string | undefined => {
  const isRetroArch = payload.kind === "retroarch" || payload.id === "retroarch"
  if (isRetroArch && payload.settings !== undefined) {
    return "RetroArch apps use typed fields and extraSettings, not raw settings"
  }
  if (!isRetroArch) {
    const misplacedKey = RETROARCH_APP_FIELD_KEYS.find(
      key => payload[key] !== undefined,
    )
    if (misplacedKey) {
      return `RetroArch field ${misplacedKey} requires kind: retroarch`
    }
  }
  return undefined
}

const AppPayloadBase = Schema.Struct({
  settings: Schema.optional(LaunchSettings),
  kind: Schema.optional(AppKind),

  // Optional executable shape for custom apps or built-in overrides.
  command: Schema.optional(NonEmptyString),
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
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})

export const AppPayload = AppPayloadBase.check(
  Schema.makeFilter(isTypedRetroArchPayload),
)
export type AppPayload = Schema.Schema.Type<typeof AppPayload>

export const AppRecord = Schema.Struct({
  id: NonEmptyString,
  ...AppPayloadBase.fields,
}).check(Schema.makeFilter(isTypedRetroArchPayload))
export type AppRecord = Schema.Schema.Type<typeof AppRecord>

export const decodeAppPayload = (input: unknown): AppPayload =>
  Schema.decodeUnknownSync(AppPayload)(input, STRICT)

export const appRecordKind = (app: Pick<AppRecord, "id" | "kind">): AppKind =>
  app.kind ?? (app.id === "retroarch" ? "retroarch" : "process")

export const isRetroArchAppRecord = (
  app: Pick<AppRecord, "id" | "kind">,
): boolean => appRecordKind(app) === "retroarch"

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
    paths,
    video,
    audio,
    input,
    extraSettings,
    extraArgs,
  } = app
  const policy: RetroArchPolicy = {
    ...(environment !== undefined ? { environment } : {}),
    ...(configFile !== undefined ? { configFile } : {}),
    ...(core !== undefined ? { core } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(logging !== undefined ? { logging } : {}),
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    ...(paths !== undefined ? { paths } : {}),
    ...(video !== undefined ? { video } : {}),
    ...(audio !== undefined ? { audio } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(extraSettings !== undefined ? { extraSettings } : {}),
    ...(extraArgs !== undefined ? { extraArgs } : {}),
  }
  return Object.keys(policy).length > 0 ? policy : undefined
}
