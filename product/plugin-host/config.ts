import { existsSync, readFileSync } from "node:fs"
import { korriConfigPath } from "@platform/config/xdg-paths"
import type { PluginId } from "@platform/plugin"
import type { PluginDiagnostic } from "@platform/plugin/diagnostics"
import { pluginDiagnostic } from "@platform/plugin/diagnostics"
import type { PluginPolicy } from "@platform/plugin/policy"

export interface PluginHostConfig {
  readonly localRoots: readonly string[]
  readonly pluginPolicy: PluginPolicy
  readonly diagnostics: readonly PluginDiagnostic[]
  readonly path?: string
}

export function readPluginHostConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PluginHostConfig {
  const path = pluginHostConfigPath(env)
  if (!path || !existsSync(path)) {
    return { localRoots: [], pluginPolicy: {}, diagnostics: [], path }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return normalizePluginHostConfig(parsed, path)
  } catch (error) {
    return {
      localRoots: [],
      pluginPolicy: {},
      path,
      diagnostics: [
        pluginDiagnostic({
          code: "invalid-plugin-config",
          source: path,
          message: `Plugin host config ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
        }),
      ],
    }
  }
}

export function pluginHostConfigPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const explicit = env.KORRI_PLUGIN_CONFIG?.trim()
  if (explicit) return explicit
  try {
    return korriConfigPath(env, "plugins.json")
  } catch {
    return undefined
  }
}

function normalizePluginHostConfig(
  input: unknown,
  path: string,
): PluginHostConfig {
  const diagnostics: PluginDiagnostic[] = []
  if (!isRecord(input)) {
    return {
      localRoots: [],
      pluginPolicy: {},
      path,
      diagnostics: [
        pluginDiagnostic({
          code: "invalid-plugin-config",
          source: path,
          message: "Plugin host config must be a JSON object",
        }),
      ],
    }
  }

  const localRoots = normalizeStringArray(
    input.localRoots ?? input.pluginRoots,
    "localRoots",
    path,
    diagnostics,
  )
  const pluginPolicy = normalizePluginPolicy(
    input.plugins ?? input.pluginPolicy,
    path,
    diagnostics,
  )

  return { localRoots, pluginPolicy, diagnostics, path }
}

function normalizeStringArray(
  input: unknown,
  field: string,
  path: string,
  diagnostics: PluginDiagnostic[],
): readonly string[] {
  if (input === undefined) return []
  if (!Array.isArray(input)) {
    diagnostics.push(
      pluginDiagnostic({
        code: "invalid-plugin-config",
        source: path,
        message: `Plugin host config field ${field} must be an array of paths`,
      }),
    )
    return []
  }
  return input.filter((item): item is string => {
    const ok = typeof item === "string" && item.trim().length > 0
    if (!ok) {
      diagnostics.push(
        pluginDiagnostic({
          code: "invalid-plugin-config",
          source: path,
          message: `Plugin host config field ${field} contains a non-string path`,
        }),
      )
    }
    return ok
  })
}

function normalizePluginPolicy(
  input: unknown,
  path: string,
  diagnostics: PluginDiagnostic[],
): PluginPolicy {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    diagnostics.push(
      pluginDiagnostic({
        code: "invalid-plugin-config",
        source: path,
        message: "Plugin host config field plugins must be an object",
      }),
    )
    return {}
  }

  const entries: Array<
    [string, { enabled?: boolean; capabilities?: string[]; source: "policy" }]
  > = []
  for (const [pluginId, rawEntry] of Object.entries(input)) {
    if (!pluginId.startsWith("@") || !pluginId.includes(":")) {
      diagnostics.push(
        pluginDiagnostic({
          code: "invalid-plugin-config",
          source: path,
          message: `Plugin policy key ${pluginId} is not a provider-style plugin id`,
        }),
      )
      continue
    }

    const policyPluginId = pluginId as PluginId
    if (rawEntry === true) {
      entries.push([policyPluginId, { enabled: true, source: "policy" }])
      continue
    }
    if (!isRecord(rawEntry)) {
      diagnostics.push(
        pluginDiagnostic({
          code: "invalid-plugin-config",
          source: path,
          pluginId: policyPluginId,
          message: `Plugin policy entry ${pluginId} must be true or an object`,
        }),
      )
      continue
    }

    const enabled =
      typeof rawEntry.enabled === "boolean" ? rawEntry.enabled : undefined
    const capabilities = Array.isArray(rawEntry.capabilities)
      ? rawEntry.capabilities.filter(
          (capability): capability is string => typeof capability === "string",
        )
      : undefined
    entries.push([
      policyPluginId,
      {
        ...(enabled === undefined ? {} : { enabled }),
        ...(capabilities === undefined ? {} : { capabilities }),
        source: "policy",
      },
    ])
  }

  return Object.fromEntries(entries) as PluginPolicy
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
