import { Schema } from "effect"

import { LaunchSettingValue, LaunchWithPolicy } from "./inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

export { LaunchSettingValue }

export const LaunchSettings = Schema.Record(Schema.String, Schema.Unknown)
export type LaunchSettings = Schema.Schema.Type<typeof LaunchSettings>

export const LaunchBlock = Schema.Struct({
  app: Schema.optional(Schema.String),
  module: Schema.optional(Schema.String),
  settings: Schema.optional(LaunchSettings),
  with: Schema.optional(LaunchWithPolicy),
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
})
export type LaunchBlock = Schema.Schema.Type<typeof LaunchBlock>

export const decodeLaunchBlock = (input: unknown): LaunchBlock =>
  Schema.decodeUnknownSync(LaunchBlock)(input, STRICT)

export const mergeLaunchSettings = (
  base: LaunchSettings | undefined,
  extra: LaunchSettings | undefined,
): LaunchSettings | undefined =>
  extra === undefined ? base : { ...(base ?? {}), ...extra }

export const launchAppOrLegacy = (input: {
  readonly launch?: LaunchBlock
  readonly launcher?: string
}): string | undefined => input.launch?.app ?? input.launcher

export interface LaunchConfigDiagnostic {
  readonly _tag:
    | "LegacyLaunchField"
    | "LaunchAliasConflict"
    | "UnmatchedByLauncher"
    | "UnknownSetting"
  readonly path: string
  readonly message: string
}

export const collectLayerLaunchDiagnostics = (
  path: string,
  input: {
    readonly launch?: LaunchBlock
    readonly launcher?: string
    readonly core?: string
    readonly byLauncher?: Readonly<Record<string, unknown>>
  },
): readonly LaunchConfigDiagnostic[] => {
  const diagnostics: LaunchConfigDiagnostic[] = []
  if (input.launch?.app !== undefined && input.launcher !== undefined) {
    diagnostics.push({
      _tag: "LaunchAliasConflict",
      path,
      message: `${path}.launch.app overrides legacy ${path}.launcher`,
    })
  } else if (input.launcher !== undefined) {
    diagnostics.push({
      _tag: "LegacyLaunchField",
      path: `${path}.launcher`,
      message: `${path}.launcher is a legacy alias for ${path}.launch.app`,
    })
  }
  if (input.launch?.module !== undefined && input.core !== undefined) {
    diagnostics.push({
      _tag: "LaunchAliasConflict",
      path,
      message: `${path}.launch.module overrides legacy ${path}.core`,
    })
  } else if (input.core !== undefined) {
    diagnostics.push({
      _tag: "LegacyLaunchField",
      path: `${path}.core`,
      message: `${path}.core is a legacy alias for ${path}.launch.module`,
    })
  }
  return diagnostics
}
