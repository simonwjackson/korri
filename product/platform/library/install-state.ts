import { Schema } from "effect"

export const PluginInstallState = Schema.Literals([
  "not-installed",
  "requested",
  "queued",
  "downloading",
  "installing",
  "installed",
  "failed",
  "unknown",
])
export type PluginInstallState = Schema.Schema.Type<typeof PluginInstallState>

export const PluginInstallNextActionHint = Schema.Literals([
  "wait",
  "retry",
  "inspect-diagnostics",
  "none",
])
export type PluginInstallNextActionHint = Schema.Schema.Type<
  typeof PluginInstallNextActionHint
>

export function parsePluginInstallState(value: unknown): PluginInstallState {
  return value === "not-installed" ||
    value === "requested" ||
    value === "queued" ||
    value === "downloading" ||
    value === "installing" ||
    value === "installed" ||
    value === "failed" ||
    value === "unknown"
    ? value
    : "unknown"
}

export function parsePluginInstallNextActionHint(
  value: unknown,
): PluginInstallNextActionHint {
  return value === "wait" ||
    value === "retry" ||
    value === "inspect-diagnostics" ||
    value === "none"
    ? value
    : "none"
}

export interface ProviderInstallMetadata {
  readonly providerId: string
  readonly appId: string
  readonly canRequestInstall: boolean
}

export const ProviderInstallMetadataSchema = Schema.Struct({
  providerId: Schema.String,
  appId: Schema.String,
  canRequestInstall: Schema.Boolean,
})
