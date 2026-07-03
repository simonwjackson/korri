import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "source values must be non-empty",
    }),
  ),
)

export const SourceKind = Schema.Literals(["service", "files", "metadata"])
export type SourceKind = Schema.Schema.Type<typeof SourceKind>

const SourceKindList = Schema.Array(SourceKind).pipe(
  Schema.check(
    Schema.makeFilter((kind: readonly SourceKind[]) =>
      kind.length > 0
        ? undefined
        : {
            path: ["kind"],
            issue: "source.kind must contain at least one kind",
          },
    ),
  ),
)

const SourceStorageFilter = Schema.makeFilter<{
  readonly kind: readonly SourceKind[]
  readonly storage?: string
}>(source =>
  source.kind.includes("files") && source.storage === undefined
    ? {
        path: ["storage"],
        issue: "sources with kind 'files' must name storage",
      }
    : undefined,
)

export const SourcePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  kind: SourceKindList,
  storage: Schema.optional(NonEmptyString),
  app: Schema.optional(NonEmptyString),
  runtime: Schema.optional(NonEmptyString),

  // Source is a cascade layer for origin-specific launch/display policy.
  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  preferences: InheritableLayer.fields.preferences,
  plugin: InheritableLayer.fields.plugin,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
}).check(SourceStorageFilter)
export type SourcePayload = Schema.Schema.Type<typeof SourcePayload>

export const SourceRecord = Schema.Struct({
  id: NonEmptyString,
  ...SourcePayload.fields,
}).check(SourceStorageFilter)
export type SourceRecord = Schema.Schema.Type<typeof SourceRecord>

export const decodeSourcePayload = (input: unknown): SourcePayload =>
  Schema.decodeUnknownSync(SourcePayload)(input, STRICT)

export const decodeSourceRecord = (input: unknown): SourceRecord =>
  Schema.decodeUnknownSync(SourceRecord)(input, STRICT)
