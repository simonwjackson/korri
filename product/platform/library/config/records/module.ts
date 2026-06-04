import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "module values must be non-empty",
    }),
  ),
)

const AbsolutePath = NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value.startsWith("/")
        ? undefined
        : {
            path: [],
            issue: "module path must be absolute",
          },
    ),
  ),
)

const ModuleKind = Schema.Literals(["libretro-core"])

export const ModulePayload = Schema.Struct({
  kind: ModuleKind,
  path: AbsolutePath,
})
export type ModulePayload = Schema.Schema.Type<typeof ModulePayload>

export const ModuleRecord = Schema.Struct({
  id: NonEmptyString,
  ...ModulePayload.fields,
})
export type ModuleRecord = Schema.Schema.Type<typeof ModuleRecord>

export const decodeModulePayload = (input: unknown): ModulePayload =>
  Schema.decodeUnknownSync(ModulePayload)(input, STRICT)
