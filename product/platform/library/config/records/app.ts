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

const isTypedRetroArchPayload = (payload: {
  readonly id?: string
  readonly kind?: AppKind
  readonly settings?: unknown
}): string | undefined =>
  (payload.kind === "retroarch" || payload.id === "retroarch") &&
  payload.settings !== undefined
    ? "RetroArch apps use typed fields and extraSettings, not raw settings"
    : undefined

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
