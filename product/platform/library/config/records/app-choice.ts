import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "app choice values must be non-empty",
    }),
  ),
)

export const AppChoice = Schema.Struct({
  id: NonEmptyString,
  kind: Schema.optional(Schema.Unknown),
  inherit: Schema.optional(Schema.Boolean),
  runtime: Schema.optional(NonEmptyString),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  retroarch: InheritableLayer.fields.retroarch,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
}).pipe(
  Schema.check(
    Schema.makeFilter(choice =>
      choice.kind === undefined
        ? undefined
        : {
            path: ["kind"],
            issue:
              "app choices reference top-level apps by id; kind belongs on top-level apps entries",
          },
    ),
  ),
)
export type AppChoice = Omit<Schema.Schema.Type<typeof AppChoice>, "kind">

export const AppChoiceList = Schema.Array(AppChoice).pipe(
  Schema.check(
    Schema.makeFilter(
      (choices: readonly Schema.Schema.Type<typeof AppChoice>[]) => {
        if (choices.length === 0) {
          return {
            path: ["apps"],
            issue: "apps must declare at least one app choice",
          }
        }

        const ids = new Set<string>()
        for (const choice of choices) {
          if (ids.has(choice.id)) {
            return {
              path: ["apps"],
              issue: `app choice id '${choice.id}' must be unique`,
            }
          }
          ids.add(choice.id)
        }

        return undefined
      },
    ),
  ),
)
export type AppChoiceList = readonly AppChoice[]

export const decodeAppChoice = (input: unknown): AppChoice =>
  Schema.decodeUnknownSync(AppChoice)(input, STRICT) as AppChoice
