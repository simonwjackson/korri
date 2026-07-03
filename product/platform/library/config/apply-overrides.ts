/**
 * Shared application of the settled `LaunchOverrides` raw escape hatch.
 *
 * These helpers concentrate the merge semantics that every launcher's override
 * handling used to reimplement:
 *
 * - `applyArgsOverrides` composes an argv from caller-supplied structural parts.
 *   `prepend` lands before the routed segment; `replace` swaps the routed
 *   segment only; `append` lands **before the trailing positional(s)**, after
 *   any `middle` structural flags. This ordering is load-bearing: RPCS3 places
 *   `--config <path>` between its routed flags and the game path, so `append`
 *   must land after that structural block, not immediately after `routed`.
 *   Callers pass the segments they own; the helper never reorders `leading`,
 *   `middle`, or `trailing`.
 * - `deepMergeConfig` / `parseConfigFragment` are the object-tree primitives the
 *   YAML (RPCS3) and JSON (Ryubing) config-override paths share. Each plugin
 *   keeps its own text-vs-object boundary and verbatim-`replace` behavior; only
 *   the deep-merge and fragment-parse mechanics are shared here.
 */

import type { LaunchOverrides } from "./records/library-item"

export interface ArgsOverrideParts {
  /** Structural argv that always comes first and is never reordered. */
  readonly leading: readonly string[]
  /** The routed segment `overrides.args.replace` may swap. */
  readonly routed: readonly string[]
  /**
   * Structural argv between the routed segment and the appended overrides
   * (e.g. RPCS3's `--config <path>`). Never reordered. Defaults to empty.
   */
  readonly middle?: readonly string[]
  /** Final positional argv (e.g. the game path). Never reordered. */
  readonly trailing: readonly string[]
  readonly overrides?: LaunchOverrides["args"]
}

export function applyArgsOverrides(parts: ArgsOverrideParts): string[] {
  const overrides = parts.overrides
  const routed = overrides?.replace ?? parts.routed
  return [
    ...parts.leading,
    ...(overrides?.prepend ?? []),
    ...routed,
    ...(parts.middle ?? []),
    ...(overrides?.append ?? []),
    ...parts.trailing,
  ]
}

type ConfigObject = Record<string, unknown>

const isConfigObject = (value: unknown): value is ConfigObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// Keys that mutate an object's prototype when assigned. Override fragments are
// release-scoped, lower-trust config on the unauthenticated launch surface, so
// they must never reach a prototype. Stripping them here protects every
// object-tree consumer (YAML for RPCS3, JSON for Ryubing) at the parse/merge
// choke points.
const PROTOTYPE_POLLUTING_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
])

const stripPrototypePollutingKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripPrototypePollutingKeys)
  if (!isConfigObject(value)) return value
  const out: ConfigObject = {}
  for (const [key, child] of Object.entries(value)) {
    if (PROTOTYPE_POLLUTING_KEYS.has(key)) continue
    out[key] = stripPrototypePollutingKeys(child)
  }
  return out
}

/** Deep-merge `patch` over `base`; nested objects merge, everything else (arrays included) is replaced by `patch`. Prototype-polluting keys are skipped. */
export function deepMergeConfig(
  base: ConfigObject,
  patch: ConfigObject,
): ConfigObject {
  const out: ConfigObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (PROTOTYPE_POLLUTING_KEYS.has(key)) continue
    const existing = out[key]
    out[key] =
      isConfigObject(existing) && isConfigObject(value)
        ? deepMergeConfig(existing, value)
        : value
  }
  return out
}

/** Parse a plain-text config fragment (via the caller's format parser) into an object, or `undefined` for empty/non-object input. Prototype-polluting keys are stripped recursively. */
export function parseConfigFragment(
  text: string,
  parse: (text: string) => unknown,
): ConfigObject | undefined {
  if (text.trim() === "") return undefined
  const parsed = parse(text)
  return isConfigObject(parsed)
    ? (stripPrototypePollutingKeys(parsed) as ConfigObject)
    : undefined
}
