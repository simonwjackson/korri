import type { LaunchOverrides } from "@platform/library/config/records/library-item"
import { parse, stringify } from "yaml"
import type { ConfigEntry } from "./mapping"

type YamlObject = Record<string, unknown>

const isPlainObject = (value: unknown): value is YamlObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Build a nested config object from `[Section.Key, value]` entries. Phase 0/1
 * targets are single-level `Section.Key`, so we split on the FIRST dot only;
 * RPCS3 keys may contain spaces or colons but never dots.
 */
export const buildConfigObject = (
  entries: readonly ConfigEntry[],
): YamlObject => {
  const root: YamlObject = {}
  for (const [path, value] of entries) {
    const dot = path.indexOf(".")
    if (dot === -1) {
      root[path] = value
      continue
    }
    const section = path.slice(0, dot)
    const key = path.slice(dot + 1)
    const existing = root[section]
    const bucket = isPlainObject(existing) ? existing : {}
    bucket[key] = value
    root[section] = bucket
  }
  return root
}

/** Deep-merge source over target (source wins; non-object values replaced). */
const deepMerge = (target: YamlObject, source: YamlObject): YamlObject => {
  const out: YamlObject = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key]
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? deepMerge(existing, value)
        : value
  }
  return out
}

export interface RenderConfigInput {
  /** Operator's canonical config.yml text, used as the read-merge base (U0). */
  readonly canonical?: string
  /** Routed `[Section.Key, value]` entries from the mapping router. */
  readonly entries: readonly ConfigEntry[]
  /** Raw escape hatch from overrides.config (plain-text YAML fragments). */
  readonly overridesConfig?: LaunchOverrides["config"]
}

const parseFragment = (text: string): YamlObject | undefined => {
  if (text.trim() === "") return undefined
  const parsed = parse(text)
  return isPlainObject(parsed) ? parsed : undefined
}

/**
 * Render the per-launch config.yml text using the read-merge-canonical model
 * proven in U0: start from the operator's canonical config, overlay routed
 * settings, then apply the raw `overrides.config` escape hatch — parsing and
 * deep-merging fragments (never blind string-append) so the file is
 * serialized exactly once and cannot carry yaml-cpp duplicate keys.
 *
 * Precedence (low → high): canonical < routed < overrides.prepend <
 * overrides.append. `overrides.config.replace` wins the whole file verbatim.
 * Returns `undefined` when there is nothing to write.
 */
export const renderConfigYaml = (
  input: RenderConfigInput,
): string | undefined => {
  const oc = input.overridesConfig
  const hasEntries = input.entries.length > 0
  const hasOverrides =
    oc !== undefined &&
    (oc.replace !== undefined ||
      (oc.append !== undefined && oc.append.trim() !== "") ||
      (oc.prepend !== undefined && oc.prepend.trim() !== ""))
  if (!hasEntries && !hasOverrides) return undefined

  if (oc?.replace !== undefined) {
    return oc.replace.endsWith("\n") ? oc.replace : `${oc.replace}\n`
  }

  const canonical =
    input.canonical !== undefined ? parse(input.canonical) : undefined
  let merged: YamlObject = isPlainObject(canonical) ? canonical : {}
  merged = deepMerge(merged, buildConfigObject(input.entries))

  for (const fragment of [oc?.prepend, oc?.append]) {
    if (fragment === undefined) continue
    const parsed = parseFragment(fragment)
    if (parsed !== undefined) merged = deepMerge(merged, parsed)
  }

  return stringify(merged)
}
