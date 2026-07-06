import type { PluginId } from "./index"

export type PluginDiagnosticCode =
  | "invalid-plugin-module"
  | "load-failed"
  | "missing-root"
  | "reserved-namespace"
  | "unsafe-entrypoint"
  | "unsafe-root"

export interface PluginDiagnostic {
  readonly code: PluginDiagnosticCode
  readonly message: string
  readonly source?: string
  readonly pluginId?: PluginId
}

export function pluginDiagnostic(
  diagnostic: PluginDiagnostic,
): PluginDiagnostic {
  return diagnostic
}
