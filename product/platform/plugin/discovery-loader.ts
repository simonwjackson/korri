import { readdir, realpath, stat } from "node:fs/promises"
import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"
import type { PluginDiagnostic } from "./diagnostics"
import { pluginDiagnostic } from "./diagnostics"
import {
  type KorriPlugin,
  type PluginDefinitionInput,
  type PluginId,
  type PluginNamespace,
  plugin,
} from "./index"

export type PluginDiscoverySource = "bundled" | "local"

export interface PluginDiscoveryRoot {
  readonly path: string
  readonly source: PluginDiscoverySource
  readonly devMode?: boolean
}

export interface PluginDiscoveryResult {
  readonly plugins: readonly KorriPlugin[]
  readonly diagnostics: readonly PluginDiagnostic[]
}

const ENTRYPOINT_FILENAMES = [
  "index.ts",
  "index.js",
  "index.mjs",
  "plugin.ts",
  "plugin.js",
  "plugin.mjs",
] as const

export async function discoverPluginRoots(
  roots: readonly PluginDiscoveryRoot[],
): Promise<PluginDiscoveryResult> {
  const plugins: KorriPlugin[] = []
  const diagnostics: PluginDiagnostic[] = []

  for (const root of roots) {
    const result = await discoverPluginRoot(root)
    plugins.push(...result.plugins)
    diagnostics.push(...result.diagnostics)
  }

  return { plugins, diagnostics }
}

async function discoverPluginRoot(
  root: PluginDiscoveryRoot,
): Promise<PluginDiscoveryResult> {
  const diagnostics: PluginDiagnostic[] = []
  const plugins: KorriPlugin[] = []
  const canonicalRoot = await safeCanonicalRoot(root, diagnostics)
  if (canonicalRoot === undefined) return { plugins, diagnostics }

  const entrypoints = await pluginEntrypoints(canonicalRoot)
  for (const entrypoint of entrypoints) {
    const canonicalEntrypoint = await realpath(entrypoint)
    if (!isWithinRoot(canonicalRoot, canonicalEntrypoint)) {
      diagnostics.push(
        pluginDiagnostic({
          code: "unsafe-entrypoint",
          source: entrypoint,
          message: `Plugin entrypoint ${entrypoint} resolves outside plugin root ${root.path}`,
        }),
      )
      continue
    }

    const loaded = await loadPluginEntrypoint(canonicalEntrypoint)
    if (!loaded.ok) {
      diagnostics.push(loaded.diagnostic)
      continue
    }

    if (root.source === "local" && loaded.plugin.namespace === "@korri") {
      diagnostics.push(
        pluginDiagnostic({
          code: "reserved-namespace",
          source: entrypoint,
          pluginId: loaded.plugin.id,
          message: `Local plugin ${loaded.plugin.id} may not use reserved @korri namespace`,
        }),
      )
      continue
    }

    plugins.push(loaded.plugin)
  }

  return { plugins, diagnostics }
}

async function safeCanonicalRoot(
  root: PluginDiscoveryRoot,
  diagnostics: PluginDiagnostic[],
): Promise<string | undefined> {
  try {
    const canonicalRoot = await realpath(root.path)
    const rootStat = await stat(canonicalRoot)
    if (!rootStat.isDirectory()) {
      diagnostics.push(
        pluginDiagnostic({
          code: "missing-root",
          source: root.path,
          message: `Plugin root ${root.path} is not a directory`,
        }),
      )
      return undefined
    }
    if (!root.devMode && (rootStat.mode & 0o002) !== 0) {
      diagnostics.push(
        pluginDiagnostic({
          code: "unsafe-root",
          source: root.path,
          message: `Plugin root ${root.path} is world-writable`,
        }),
      )
      return undefined
    }
    return canonicalRoot
  } catch (error) {
    diagnostics.push(
      pluginDiagnostic({
        code: "missing-root",
        source: root.path,
        message: `Plugin root ${root.path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      }),
    )
    return undefined
  }
}

async function pluginEntrypoints(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const entrypoints = new Set<string>()

  for (const filename of ENTRYPOINT_FILENAMES) {
    const candidate = join(root, filename)
    if (await fileExists(candidate)) entrypoints.add(candidate)
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    for (const filename of ENTRYPOINT_FILENAMES) {
      const candidate = join(root, entry.name, filename)
      if (await fileExists(candidate)) {
        entrypoints.add(candidate)
        break
      }
    }
  }

  return [...entrypoints].sort()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const candidate = await stat(path)
    return candidate.isFile()
  } catch {
    return false
  }
}

async function loadPluginEntrypoint(
  entrypoint: string,
): Promise<
  | { readonly ok: true; readonly plugin: KorriPlugin }
  | { readonly ok: false; readonly diagnostic: PluginDiagnostic }
> {
  try {
    const moduleUrl = `${pathToFileURL(entrypoint).href}?mtime=${Date.now()}`
    const module = (await import(moduleUrl)) as { readonly default?: unknown }
    const plugin = normalizePluginExport(module.default)
    if (!plugin) {
      return {
        ok: false,
        diagnostic: pluginDiagnostic({
          code: "invalid-plugin-module",
          source: entrypoint,
          message: `Plugin module ${entrypoint} must default-export a KorriPlugin descriptor`,
        }),
      }
    }
    return { ok: true, plugin }
  } catch (error) {
    return {
      ok: false,
      diagnostic: pluginDiagnostic({
        code: "load-failed",
        source: entrypoint,
        message: `Plugin module ${entrypoint} failed to load: ${error instanceof Error ? error.message : String(error)}`,
      }),
    }
  }
}

function normalizePluginExport(value: unknown): KorriPlugin | undefined {
  if (isKorriPlugin(value)) return value
  if (isPluginDefinitionInput(value)) return plugin(value)
  return undefined
}

function isPluginDefinitionInput(
  value: unknown,
): value is PluginDefinitionInput {
  if (!isRecord(value)) return false
  if (!isPluginNamespace(value.namespace)) return false
  if (typeof value.name !== "string") return false
  if (value.title !== undefined && typeof value.title !== "string") return false
  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    return false
  }
  if (value.contributes !== undefined && !isRecord(value.contributes)) {
    return false
  }
  return true
}

function isKorriPlugin(value: unknown): value is KorriPlugin {
  if (!isRecord(value)) return false
  if (!isPluginId(value.id)) return false
  if (!isPluginNamespace(value.namespace)) return false
  if (typeof value.name !== "string") return false
  if (typeof value.title !== "string") return false
  if (!Array.isArray(value.handlers)) return false
  if (!isRecord(value.ref) || value.ref.provider !== value.id) return false
  if (!isRecord(value.contributes)) return false
  const contributes = value.contributes as { readonly config?: unknown }
  if (!isRecord(contributes.config)) return false
  const config = contributes.config as { readonly providers?: unknown }
  if (!isRecord(config.providers)) return false
  return true
}

function isPluginId(value: unknown): value is PluginId {
  return (
    typeof value === "string" && value.startsWith("@") && value.includes(":")
  )
}

function isPluginNamespace(value: unknown): value is PluginNamespace {
  return (
    typeof value === "string" && value.startsWith("@") && !value.includes(":")
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function isWithinRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`)
}
