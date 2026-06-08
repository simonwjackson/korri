import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "runtime values must be non-empty",
    }),
  ),
)

const AbsolutePath = NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value.startsWith("/")
        ? undefined
        : {
            path: ["path"],
            issue: "runtime path must be absolute",
          },
    ),
  ),
)

export const RuntimeKind = Schema.Literals([
  "libretro-core",
  "tool",
  "emulator",
])
export type RuntimeKind = Schema.Schema.Type<typeof RuntimeKind>

export const RuntimePayload = Schema.Struct({
  kind: RuntimeKind,
  path: AbsolutePath,

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type RuntimePayload = Schema.Schema.Type<typeof RuntimePayload>

export const RuntimeRecord = Schema.Struct({
  id: NonEmptyString,
  ...RuntimePayload.fields,
})
export type RuntimeRecord = Schema.Schema.Type<typeof RuntimeRecord>

export const decodeRuntimePayload = (input: unknown): RuntimePayload =>
  Schema.decodeUnknownSync(RuntimePayload)(input, STRICT)

export const decodeRuntimeRecord = (input: unknown): RuntimeRecord =>
  Schema.decodeUnknownSync(RuntimeRecord)(input, STRICT)
