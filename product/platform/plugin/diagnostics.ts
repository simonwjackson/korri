import type { PluginId } from "./index"

export type PluginDiagnosticCode =
  | "invalid-plugin-config"
  | "invalid-plugin-module"
  | "denied-capability"
  | "load-failed"
  | "missing-plugin"
  | "missing-root"
  | "reserved-namespace"
  | "unsafe-entrypoint"
  | "unsafe-root"

export interface PluginDiagnostic {
  readonly code: PluginDiagnosticCode
  readonly message: string
  readonly source?: string
  readonly pluginId?: PluginId
  readonly capability?: string
}

export function pluginDiagnostic(
  diagnostic: PluginDiagnostic,
): PluginDiagnostic {
  return diagnostic
}
