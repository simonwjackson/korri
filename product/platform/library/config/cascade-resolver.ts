/**
 * Cascade resolver — the heart of the seven-layer config model.
 *
 * Public resolver surfaces:
 * - `enumerateApplicablePresets(snapshot, inputs)` returns the
 *   user-facing preset menu as `Map<presetName, ResolvedPreset[]>`.
 *   Each chain is ordered least-specific → most-specific with
 *   `inherit: false` truncation applied.
 * - `resolveLocalLauncherPolicy(snapshot, inputs)` folds host/app policy for
 *   local launcher siblings such as Moonlight.
 * - `resolveReadableLaunchContext(snapshot, inputs)` resolves readable library
 *   app choices and launch context for persisted library releases.
 *
 * Skeleton pre-pass: resolve the launcher first by scanning override
 * → selected preset chain (most→least specific) → game → system → user
 * → global. This is needed so the cascade knows which launcher layer
 * to fold in and which `byLauncher[L]` entries to merge.
 *
 * For preset enumeration, a *separate* skeleton scan computes
 * `L₀ = first non-null launcher from game/system/user/global only` so
 * `launchers[L₀].presets` can contribute to the visible menu without
 * circularity.
 *
 * All output goes through `Effect.succeed` / `Effect.fail` so callers
 * can pipe the error union into their own Effect chains.
 */

import { Data, Effect } from "effect"
import {
  getBuiltInAppDescriptor,
  mergeAppLaunchCompanions,
} from "./app-integrations"
import type { EphemeralOverride } from "./ephemeral-override"
import {
  AppNotFound,
  GameNotFound,
  PresetNotFound,
  type ResolutionError,
  UserNotFound,
} from "./errors"
import {
  type ByLauncherPayload,
  type LaunchCompanionMap,
  type LaunchPolicy,
  launchCompanionsFromLaunch,
  type MoonlightPolicy,
  type PluginPolicyMap,
} from "./inheritable-fields"
import type { LaunchBlock, LaunchSettings } from "./launch-block"
import { mergeLaunchSettings } from "./launch-block"
import {
  listPlayableEntries,
  type PlayableEntry,
  selectLaunchableRelease,
  splitPlayableId,
} from "./playable-id"
import { type AppRecord, appRecordKind } from "./records/app"
import type { CollectionRecord } from "./records/collection"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { HostRecord } from "./records/host"
import type { LauncherRecord } from "./records/launcher"
import type {
  LaunchOverrides,
  LibraryItemRecord,
  LibraryReleasePayload,
} from "./records/library-item"
import type { ModuleRecord } from "./records/module"
import type { PresetPayload } from "./records/preset"
import type { ProfileRecord } from "./records/profile"
import type { ProviderRecord } from "./records/provider"
import type { ProviderLinkRecord } from "./records/provider-link"
import type { RuntimeRecord } from "./records/runtime"
import type { StorageRecord } from "./records/storage"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"
import type { ReadableResolvedLaunchContext } from "./resolved-launch-context"
import {
  type ReleaseTargetAtom,
  resolveReleaseTarget,
} from "./source-target-resolution"

// ────────────────────────────────────────────────────────────────────
// Snapshot types
// ────────────────────────────────────────────────────────────────────

export interface ConfigSnapshot {
  readonly global: GlobalConfigRecord | null
  readonly users: ReadonlyMap<string, UserRecord>
  readonly systems: ReadonlyMap<string, SystemRecord>
  readonly launchers: ReadonlyMap<string, LauncherRecord>
  readonly readableLaunchers: ReadonlyMap<string, AppRecord>
  readonly modules: ReadonlyMap<string, ModuleRecord>
  readonly games: ReadonlyMap<string, GameRecord>
  readonly collections: ReadonlyMap<string, CollectionRecord>
}

export const emptySnapshot = (): ConfigSnapshot => ({
  global: null,
  users: new Map(),
  systems: new Map(),
  launchers: new Map(),
  readableLaunchers: new Map(),
  modules: new Map(),
  games: new Map(),
  collections: new Map(),
})

export interface ResolveInputs {
  readonly gameId: string
  readonly userId?: string
  readonly presetId?: string
  readonly override?: EphemeralOverride
}

export interface ResolveLocalLauncherCompanionPolicyInputs {
  readonly launcherId: string
  readonly override?: EphemeralOverride
}

export interface ResolveLocalLauncherPolicyInputs {
  readonly launcherId: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLocalLauncherPolicy {
  readonly launchCompanions: LaunchCompanionMap
  readonly moonlight?: MoonlightPolicy
}

export interface ResolveReadableLocalLauncherPolicyInputs {
  readonly launcherId: string
  readonly override?: ReadableOverride
}

export type PresetLayerOrigin =
  | "global"
  | "user"
  | "system"
  | "launcher"
  | "game"

export interface ResolvedPresetLink {
  readonly layer: PresetLayerOrigin
  readonly payload: PresetPayload
}

export type ApplicablePresets = ReadonlyMap<
  string,
  readonly ResolvedPresetLink[]
>

// ────────────────────────────────────────────────────────────────────
// Inheritable-layer "view" — what each cascade layer contributes
// ────────────────────────────────────────────────────────────────────

/**
 * A bag of inheritable contributions read off a single layer record.
 * Carries the raw field values plus the `inherit:false` truncation flag
 * and the `byLauncher` sub-map that gets folded in when the resolved
 * launcher matches.
 *
 * Identity fields (`system`, `contentPath`) are NOT here — they bypass
 * the cascade fold and come straight from the game record.
 */
interface InheritableView {
  readonly inherit?: boolean
  readonly launchCompanions?: LaunchCompanionMap
  readonly moonlight?: MoonlightPolicy
  readonly plugin?: PluginPolicyMap
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
  readonly byLauncher?: ByLauncherPayload
  readonly launch?: LaunchBlock
  readonly launcher?: string
  readonly module?: string
  readonly settings?: LaunchSettings
}

type LegacySystemLaunchFields = {
  readonly launch?: LaunchBlock
  readonly launcher?: string
}

const legacySystemLaunchFields = (
  system: SystemRecord | undefined,
): LegacySystemLaunchFields => (system ?? {}) as LegacySystemLaunchFields

const viewOfGlobal = (g: GlobalConfigRecord | null): InheritableView =>
  g
    ? {
        launch: g.launch,
        launcher: g.launch?.app ?? g.launcher,
        module: g.launch?.module,
        settings: g.launch?.settings,
        launchCompanions: launchCompanionsFromLaunch(g),
        moonlight: g.moonlight,
        plugin: g.plugin,
        env: g.env,
        cwd: g.cwd,
        argsAppend: g.argsAppend,
        patches: g.patches,
        byLauncher: g.byLauncher,
      }
    : {}

const viewOfLauncher = (l: LauncherRecord | undefined): InheritableView =>
  l
    ? {
        inherit: l.inherit,
        launchCompanions: launchCompanionsFromLaunch(l),
        moonlight: l.moonlight,
        plugin: l.plugin,
        env: l.env,
        cwd: l.cwd,
        argsAppend: l.argsAppend,
        patches: l.patches,
        byLauncher: l.byLauncher,
      }
    : {}

const viewOfOverride = (o: EphemeralOverride): InheritableView => ({
  launch: o.launch,
  launcher: o.launch?.app ?? o.launcher,
  module: o.launch?.module,
  settings: o.launch?.settings,
  inherit: o.inherit,
  launchCompanions: launchCompanionsFromLaunch(o),
  moonlight: o.moonlight,
  env: o.env,
  cwd: o.cwd,
  argsAppend: o.argsAppend,
  patches: o.patches,
  byLauncher: o.byLauncher,
})

// ────────────────────────────────────────────────────────────────────
// Merge helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Folds an ordered list of `InheritableView`s (least → most specific)
 * into a single resolved view. Honors `inherit: false` by truncating
 * everything less specific than the layer that sets it. Folds
 * `byLauncher[L]` at each layer when `L` is provided.
 *
 * Folding rules:
 * - `launch.with`   → provider-keyed companion map; objects deep-merge,
 *   arrays concatenate, scalars last-win.
 * - `env`           → map merge per key, more-specific wins.
 * - `cwd`           → scalar, most-specific wins.
 * - `argsAppend`    → list concat in inheritance order.
 * - `patches`       → list concat in inheritance order.
 * - `launcher`      → scalar, most-specific wins (used by skeleton pass).
 */
const foldLayers = (
  layers: readonly InheritableView[],
  resolvedLauncherId: string | undefined,
): InheritableView => {
  // Apply inherit:false truncation — drop all layers strictly less-specific
  // than the truncating layer.
  let active: readonly InheritableView[] = layers
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i]?.inherit === false) {
      active = layers.slice(i)
      break
    }
  }

  let launchCompanions: LaunchCompanionMap | undefined
  let moonlight: MoonlightPolicy | undefined
  let plugin: PluginPolicyMap | undefined
  let env: Record<string, string> | undefined
  let cwd: string | undefined
  let argsAppend: string[] | undefined
  let patches: string[] | undefined
  let launcher: string | undefined
  let module: string | undefined
  let settings: LaunchSettings | undefined

  const mergeView = (view: InheritableView) => {
    // Merge byLauncher[L] INTO this view first, then fold the result.
    const merged: InheritableView =
      view.byLauncher && resolvedLauncherId
        ? mergeByLauncher(view, view.byLauncher[resolvedLauncherId])
        : view

    if (merged.launcher !== undefined) launcher = merged.launcher
    if (merged.module !== undefined) module = merged.module
    if (merged.settings !== undefined) {
      settings = mergeLaunchSettings(settings, merged.settings)
    }
    const mergedCompanions =
      merged.launchCompanions ?? launchCompanionsFromLaunch(merged)
    if (mergedCompanions !== undefined) {
      launchCompanions = foldLaunchCompanions(
        launchCompanions,
        mergedCompanions,
      )
    }
    if (merged.moonlight !== undefined) {
      moonlight = foldMoonlight(moonlight, merged.moonlight)
    }
    if (merged.plugin !== undefined) {
      plugin = foldPluginPolicies(plugin, merged.plugin)
    }
    if (merged.env !== undefined) {
      env = { ...(env ?? {}), ...merged.env }
    }
    if (merged.cwd !== undefined) cwd = merged.cwd
    if (merged.argsAppend !== undefined) {
      argsAppend = [...(argsAppend ?? []), ...merged.argsAppend]
    }
    if (merged.patches !== undefined) {
      patches = [...(patches ?? []), ...merged.patches]
    }

    if (merged.launch?.env !== undefined) {
      env = { ...(env ?? {}), ...merged.launch.env }
    }
    if (merged.launch?.cwd !== undefined) cwd = merged.launch.cwd
    if (merged.launch?.args !== undefined) {
      argsAppend = [...(argsAppend ?? []), ...merged.launch.args]
    }
  }

  for (const view of active) mergeView(view)

  return {
    launchCompanions,
    moonlight,
    plugin,
    env,
    cwd,
    argsAppend,
    patches,
    launcher,
    module,
    settings,
  }
}

/** Merge a view with an additional `byLauncher[L]` contribution. */
const mergeByLauncher = (
  base: InheritableView,
  extra: InheritableView | undefined,
): InheritableView => {
  if (!extra) return base
  const baseCompanions =
    base.launchCompanions ?? launchCompanionsFromLaunch(base)
  const extraCompanions =
    extra.launchCompanions ?? launchCompanionsFromLaunch(extra)
  return {
    ...base,
    launchCompanions:
      extraCompanions !== undefined
        ? foldLaunchCompanions(baseCompanions, extraCompanions)
        : baseCompanions,
    moonlight: extra.moonlight
      ? foldMoonlight(base.moonlight, extra.moonlight)
      : base.moonlight,
    plugin: extra.plugin
      ? foldPluginPolicies(base.plugin, extra.plugin)
      : base.plugin,
    env:
      extra.env !== undefined
        ? { ...(base.env ?? {}), ...extra.env }
        : base.env,
    cwd: extra.cwd ?? base.cwd,
    argsAppend:
      extra.argsAppend !== undefined
        ? [...(base.argsAppend ?? []), ...extra.argsAppend]
        : base.argsAppend,
    patches:
      extra.patches !== undefined
        ? [...(base.patches ?? []), ...extra.patches]
        : base.patches,
    module: extra.module ?? base.module,
    settings: mergeLaunchSettings(base.settings, extra.settings),
  }
}

const isPlainCompanionObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const foldCompanionValue = (base: unknown, extra: unknown): unknown => {
  if (extra === undefined) return base
  if (Array.isArray(extra)) {
    return [...(Array.isArray(base) ? base : []), ...extra]
  }
  if (isPlainCompanionObject(base) && isPlainCompanionObject(extra)) {
    return [...new Set([...Object.keys(base), ...Object.keys(extra)])].reduce<
      Record<string, unknown>
    >((merged, key) => {
      const value = foldCompanionValue(base[key], extra[key])
      if (value !== undefined) merged[key] = value
      return merged
    }, {})
  }
  return extra
}

const foldLaunchCompanions = (
  base: LaunchCompanionMap | undefined,
  extra: LaunchCompanionMap,
): LaunchCompanionMap =>
  [...new Set([...Object.keys(base ?? {}), ...Object.keys(extra)])].reduce<
    Record<string, unknown>
  >((merged, providerId) => {
    const baseRecord = (base ?? {}) as Readonly<Record<string, unknown>>
    const extraRecord = extra as Readonly<Record<string, unknown>>
    const value = foldCompanionValue(
      baseRecord[providerId],
      extraRecord[providerId],
    )
    if (value !== undefined) merged[providerId] = value
    return merged
  }, {}) as LaunchCompanionMap

const isPlainPolicyObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergePluginPolicyValue = (
  base: unknown,
  extra: unknown,
  path: readonly string[],
): unknown => {
  if (extra === undefined) return base
  if (Array.isArray(extra)) {
    return [...(Array.isArray(base) ? base : []), ...extra]
  }
  if (isPlainPolicyObject(base) && isPlainPolicyObject(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [childKey, childValue] of Object.entries(extra)) {
      merged[childKey] = mergePluginPolicyValue(merged[childKey], childValue, [
        ...path,
        childKey,
      ])
    }
    return merged
  }
  return extra
}

export const foldPluginPolicies = (
  base: PluginPolicyMap | undefined,
  extra: PluginPolicyMap,
): PluginPolicyMap =>
  mergePluginPolicyValue(base ?? {}, extra, []) as PluginPolicyMap

/**
 * Fold two `LaunchOverrides` in inheritance order (base = less specific).
 * `args.prepend`/`args.append` and `config.prepend`/`config.append`
 * **accumulate** (arrays concatenate, config text joins with a newline);
 * `replace` is most-specific-wins. This mirrors the `argsAppend` concat
 * convention and the field names (`prepend`/`append` imply accumulation).
 * How `replace` suppresses generated fragments is an application concern
 * handled by each launcher materializer, not by this merge.
 */
export const foldLaunchOverrides = (
  base: LaunchOverrides | undefined,
  extra: LaunchOverrides,
): LaunchOverrides => {
  const concatArr = (
    a: readonly string[] | undefined,
    b: readonly string[] | undefined,
  ): readonly string[] | undefined =>
    a !== undefined || b !== undefined
      ? [...(a ?? []), ...(b ?? [])]
      : undefined
  const concatStr = (
    a: string | undefined,
    b: string | undefined,
  ): string | undefined => {
    const parts = [a, b].filter(
      (s): s is string => s !== undefined && s !== "",
    )
    return parts.length > 0 ? parts.join("\n") : undefined
  }
  const foldArgs = ():
    | {
        prepend?: readonly string[]
        append?: readonly string[]
        replace?: readonly string[]
      }
    | undefined => {
    const ba = base?.args
    const ea = extra.args
    if (ba === undefined && ea === undefined) return undefined
    const prepend = concatArr(ba?.prepend, ea?.prepend)
    const append = concatArr(ba?.append, ea?.append)
    const replace = ea?.replace ?? ba?.replace
    const out: {
      prepend?: readonly string[]
      append?: readonly string[]
      replace?: readonly string[]
    } = {}
    if (prepend !== undefined) out.prepend = prepend
    if (append !== undefined) out.append = append
    if (replace !== undefined) out.replace = replace
    return Object.keys(out).length > 0 ? out : undefined
  }
  const foldConfig = ():
    | { prepend?: string; append?: string; replace?: string }
    | undefined => {
    const bc = base?.config
    const ec = extra.config
    if (bc === undefined && ec === undefined) return undefined
    const prepend = concatStr(bc?.prepend, ec?.prepend)
    const append = concatStr(bc?.append, ec?.append)
    const replace = ec?.replace ?? bc?.replace
    const out: { prepend?: string; append?: string; replace?: string } = {}
    if (prepend !== undefined) out.prepend = prepend
    if (append !== undefined) out.append = append
    if (replace !== undefined) out.replace = replace
    return Object.keys(out).length > 0 ? out : undefined
  }
  const args = foldArgs()
  const config = foldConfig()
  const result: {
    args?: LaunchOverrides["args"]
    config?: LaunchOverrides["config"]
  } = {}
  if (args !== undefined) result.args = args
  if (config !== undefined) result.config = config
  return result
}

const mergeMoonlightValue = (
  base: unknown,
  extra: unknown,
  path: readonly string[],
): unknown => {
  if (extra === undefined) return base
  const key = path.join(".")
  if (key === "extraArgs" || key === "input.devices") {
    return Array.isArray(extra)
      ? [...(Array.isArray(base) ? base : []), ...extra]
      : extra
  }
  if (key === "environment") {
    return isPlainPolicyObject(extra)
      ? { ...(isPlainPolicyObject(base) ? base : {}), ...extra }
      : extra
  }
  if (isPlainPolicyObject(base) && isPlainPolicyObject(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [childKey, childValue] of Object.entries(extra)) {
      merged[childKey] = mergeMoonlightValue(merged[childKey], childValue, [
        ...path,
        childKey,
      ])
    }
    return merged
  }
  return extra
}

/** Deep-merge two Moonlight policies; input.devices/extraArgs concat, scalars last-win. */
const foldMoonlight = (
  base: MoonlightPolicy | undefined,
  extra: MoonlightPolicy,
): MoonlightPolicy =>
  mergeMoonlightValue(base ?? {}, extra, []) as MoonlightPolicy

// ────────────────────────────────────────────────────────────────────
// Skeleton pass — resolve launcher
// ────────────────────────────────────────────────────────────────────

/**
 * `L₀` — the launcher used for preset enumeration (scans game/system/
 * user/global only, ignoring preset.launcher and override.launcher).
 *
 * Returns `undefined` if no layer sets a launcher; the caller decides
 * whether that's an error (depends on whether presetId or override
 * were supplied with their own launcher).
 */
const skeletonLauncherForPresetEnum = (
  snap: ConfigSnapshot,
  inputs: ResolveInputs,
  game: GameRecord,
): string | undefined => {
  if (game.launch?.app ?? game.launcher)
    return game.launch?.app ?? game.launcher
  const sys = legacySystemLaunchFields(snap.systems.get(game.system))
  if (sys.launch?.app ?? sys.launcher) return sys.launch?.app ?? sys.launcher
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launch?.app ?? usr?.launcher)
      return usr?.launch?.app ?? usr?.launcher
  }
  return snap.global?.launch?.app ?? snap.global?.launcher
}

// ────────────────────────────────────────────────────────────────────
// Preset enumeration
// ────────────────────────────────────────────────────────────────────

const presetsOnLayer = (
  layer: PresetLayerOrigin,
  source:
    | GlobalConfigRecord
    | UserRecord
    | LauncherRecord
    | GameRecord
    | undefined
    | null,
): Array<{ name: string; link: ResolvedPresetLink }> => {
  if (!source?.presets) return []
  return Object.entries(source.presets).map(([name, payload]) => ({
    name,
    link: { layer, payload },
  }))
}

const truncateChain = (
  chain: readonly ResolvedPresetLink[],
): readonly ResolvedPresetLink[] => {
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i]?.payload.inherit === false) return chain.slice(i)
  }
  return chain
}

export const resolveLocalLauncherPolicy = (
  snap: ConfigSnapshot,
  inputs: ResolveLocalLauncherPolicyInputs,
): ResolvedLocalLauncherPolicy => {
  const layers: InheritableView[] = [
    viewOfGlobal(snap.global),
    viewOfLauncher(snap.launchers.get(inputs.launcherId)),
  ]
  if (inputs.override) layers.push(viewOfOverride(inputs.override))

  const folded = foldLayers(layers, inputs.launcherId)
  return {
    launchCompanions: folded.launchCompanions ?? {},
    ...(folded.moonlight ? { moonlight: folded.moonlight } : {}),
  }
}

export const resolveLocalLauncherCompanionPolicy = (
  snap: ConfigSnapshot,
  inputs: ResolveLocalLauncherCompanionPolicyInputs,
): LaunchCompanionMap =>
  resolveLocalLauncherPolicy(snap, inputs).launchCompanions

export const enumerateApplicablePresets = (
  snap: ConfigSnapshot,
  inputs: Pick<ResolveInputs, "gameId" | "userId">,
): Effect.Effect<ApplicablePresets, ResolutionError> =>
  Effect.gen(function* () {
    const game = snap.games.get(inputs.gameId)
    if (!game)
      return yield* Effect.fail(new GameNotFound({ gameId: inputs.gameId }))

    if (inputs.userId !== undefined && !snap.users.has(inputs.userId)) {
      return yield* Effect.fail(new UserNotFound({ userId: inputs.userId }))
    }

    const user = inputs.userId ? snap.users.get(inputs.userId) : undefined
    const L0 = skeletonLauncherForPresetEnum(snap, inputs, game)
    const lncher = L0 ? snap.launchers.get(L0) : undefined

    // Collect contributions per preset name, in inheritance order.
    const byName = new Map<string, ResolvedPresetLink[]>()
    const push = (name: string, link: ResolvedPresetLink) => {
      const existing = byName.get(name) ?? []
      existing.push(link)
      byName.set(name, existing)
    }
    for (const { name, link } of presetsOnLayer("global", snap.global))
      push(name, link)
    for (const { name, link } of presetsOnLayer("user", user)) push(name, link)
    for (const { name, link } of presetsOnLayer("launcher", lncher))
      push(name, link)
    for (const { name, link } of presetsOnLayer("game", game)) push(name, link)

    // Truncate each chain at its most-specific inherit:false link.
    const result = new Map<string, readonly ResolvedPresetLink[]>()
    for (const [name, chain] of byName.entries()) {
      result.set(name, truncateChain(chain))
    }
    return result
  })

// ────────────────────────────────────────────────────────────────────
// Readable schema cascade (host → user → system → app → runtime
// → library item → contained playable → release → profile → override)
// ────────────────────────────────────────────────────────────────────

export interface ReadableConfigSnapshot {
  readonly host: HostRecord | null
  readonly users: ReadonlyMap<string, UserRecord>
  readonly systems: ReadonlyMap<string, SystemRecord>
  readonly providers?: ReadonlyMap<string, ProviderRecord>
  readonly providerLinks?: ReadonlyMap<string, ProviderLinkRecord>
  /** @deprecated old source records are ignored by readable launch resolution. */
  readonly sources?: ReadonlyMap<string, unknown>
  readonly readableLaunchers: ReadonlyMap<string, AppRecord>
  readonly runtimes: ReadonlyMap<string, RuntimeRecord>
  readonly profiles: ReadonlyMap<string, ProfileRecord>
  readonly storage: ReadonlyMap<string, StorageRecord>
  readonly library: ReadonlyMap<string, LibraryItemRecord>
}

export class PlayableNotFound extends Data.TaggedError("PlayableNotFound")<{
  readonly playableId: string
}> {}

export class ReleaseNotFound extends Data.TaggedError("ReleaseNotFound")<{
  readonly releaseId: string
}> {}

export class ReleaseNotLaunchable extends Data.TaggedError(
  "ReleaseNotLaunchable",
)<{
  readonly releaseId: string
}> {}

export class NoLaunchableRelease extends Data.TaggedError(
  "NoLaunchableRelease",
)<{
  readonly playableId: string
}> {}

export class AmbiguousRelease extends Data.TaggedError("AmbiguousRelease")<{
  readonly playableId: string
  readonly releaseIds: readonly string[]
}> {}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly runtimeId: string
}> {}

export class IncompatibleLaunchSelection extends Data.TaggedError(
  "IncompatibleLaunchSelection",
)<{
  readonly appId: string
  readonly runtimeId?: string
  readonly systemId: string
  readonly reason: string
}> {}

interface ReadableOverride {
  readonly launch?: LaunchPolicy
  readonly moonlight?: MoonlightPolicy
  readonly plugin?: PluginPolicyMap
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
}

export interface ResolveReadableLaunchInputs {
  readonly playableId: string
  readonly releaseId?: string
  readonly appId?: string
  readonly userId?: string
  readonly profileId?: string
  readonly override?: ReadableOverride
}

interface ReadableLayerView {
  readonly launch?: LaunchPolicy
  readonly launchCompanions?: LaunchCompanionMap
  readonly moonlight?: MoonlightPolicy
  readonly plugin?: PluginPolicyMap
  readonly settings?: LaunchSettings
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
  readonly overrides?: LaunchOverrides
}

const readableViewOfUser = (user: UserRecord | undefined): ReadableLayerView =>
  user
    ? {
        launchCompanions: launchCompanionsFromLaunch(user),
        moonlight: user.moonlight,
        plugin: user.plugin,
        env: user.env,
        cwd: user.cwd,
        argsAppend: user.argsAppend,
        patches: user.patches,
      }
    : {}

const readableViewOfSystem = (
  _system: SystemRecord | undefined,
): ReadableLayerView => ({})

const pluginPolicyFromSettings = (
  launcherPlugin: string | undefined,
  settings: LaunchSettings | undefined,
  options: { readonly allowContentPath?: boolean } = {},
): PluginPolicyMap | undefined => {
  const pluginSettings = settings?.plugin
  if (launcherPlugin === undefined || pluginSettings == null) {
    return undefined
  }
  const pluginSettingsRecord = pluginSettings as Record<string, unknown>
  if (options.allowContentPath === false) {
    return { [launcherPlugin]: stripReleaseScopedRootOverrides(pluginSettingsRecord) }
  }
  return { [launcherPlugin]: pluginSettingsRecord }
}

/**
 * Strip operator-owned, filesystem-root-redirecting keys from
 * release-scoped plugin settings. A release payload (often lower-trust
 * library data) must not redirect where a launcher reads/writes:
 * `content.path` (content root), `state` (emulator state root), or
 * `firmware` (firmware sentinel path). These are sourced from
 * app/runtime/operator layers only. Relevant to the unauthenticated
 * `app.library.launch` surface on trusted-LAN deployments.
 */
const stripReleaseScopedRootOverrides = (
  pluginSettings: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...pluginSettings }
  const content = result.content
  if (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    "path" in content
  ) {
    delete result.content
  }
  delete result.state
  delete result.firmware
  return result
}

const readableViewOfApp = (app: AppRecord | undefined): ReadableLayerView =>
  app
    ? {
        launchCompanions: launchCompanionsFromLaunch(app),
        moonlight: app.moonlight,
        plugin: pluginPolicyFromSettings(app.plugin, app.settings),
        settings: app.settings,
        env: app.env,
        cwd: app.cwd,
        argsAppend: app.argsAppend,
        patches: app.patches,
      }
    : {}

const readableBuiltInArgs = (
  appId: string,
  legacyArgs: readonly string[],
): readonly string[] => {
  if (appId === "mame") return ["{content.path}"]
  if (appId === "dolphin") return ["--batch", "--exec", "{content.path}"]
  if (appId === "solarus") return ["{content.path}"]
  return legacyArgs
}

const launchPolicyWithCompanions = (
  launchCompanions: LaunchCompanionMap | undefined,
): LaunchPolicy | undefined =>
  launchCompanions === undefined ? undefined : { with: launchCompanions }

const resolveReadableLauncherRecord = (
  appId: string,
  readableLaunchers: ReadonlyMap<string, AppRecord>,
): AppRecord | undefined => {
  const override = readableLaunchers.get(appId)
  const builtIn = getBuiltInAppDescriptor(appId)
  if (builtIn === undefined) return override
  const launchCompanions = mergeAppLaunchCompanions(
    builtIn.launchCompanions,
    override ? launchCompanionsFromLaunch(override) : undefined,
  )
  return {
    id: appId,
    plugin: override?.plugin ?? builtIn.kind,
    command: override?.command ?? builtIn.command,
    runtime: override?.runtime,
    args: override?.args ?? readableBuiltInArgs(appId, builtIn.args),
    systems: override?.systems ?? builtIn.systems,
    policy: override?.policy ?? builtIn.policy,
    settings: override?.settings ?? builtIn.settings,
    launch: launchPolicyWithCompanions(launchCompanions),
    moonlight: override?.moonlight ?? builtIn.moonlight,
    env: override?.env ?? builtIn.env,
    cwd: override?.cwd ?? builtIn.cwd,
    argsAppend: override?.argsAppend ?? builtIn.argsAppend,
    patches: override?.patches,
    inherit: override?.inherit,
    presets: override?.presets ?? builtIn.presets,
  }
}

type ReadableLauncherSelection =
  | {
      readonly _tag: "Selected"
      readonly appId: string
      readonly app: AppRecord
    }
  | {
      readonly _tag: "NotFound"
      readonly appId: string
    }
  | {
      readonly _tag: "Ambiguous"
      readonly pluginId: string
      readonly appIds: readonly string[]
    }

const resolveReadableLauncherSelection = (input: {
  readonly explicitAppId: string | undefined
  readonly pluginId: string | undefined
  readonly systemId: string
  readonly readableLaunchers: ReadonlyMap<string, AppRecord>
}): ReadableLauncherSelection | undefined => {
  if (input.explicitAppId !== undefined) {
    const app = resolveReadableLauncherRecord(
      input.explicitAppId,
      input.readableLaunchers,
    )
    return app === undefined
      ? { _tag: "NotFound", appId: input.explicitAppId }
      : { _tag: "Selected", appId: input.explicitAppId, app }
  }

  if (input.pluginId === undefined) return undefined

  const candidates = [...input.readableLaunchers.values()].filter(app => {
    if (appRecordKind(app) !== input.pluginId) return false
    return (
      app.systems === undefined ||
      app.systems.length === 0 ||
      app.systems.includes(input.systemId)
    )
  })
  if (candidates.length === 0)
    return { _tag: "NotFound", appId: input.pluginId }
  if (candidates.length > 1) {
    return {
      _tag: "Ambiguous",
      pluginId: input.pluginId,
      appIds: candidates.map(app => app.id),
    }
  }
  const app = candidates[0] as AppRecord
  return { _tag: "Selected", appId: app.id, app }
}

const validateReadableLaunchCompatibility = (input: {
  readonly appId: string
  readonly app: AppRecord
  readonly runtime?: RuntimeRecord
  readonly systemId: string
}): Effect.Effect<void, IncompatibleLaunchSelection> => {
  const expectedApp = input.runtime?.app
  if (expectedApp !== undefined && expectedApp !== input.appId) {
    return Effect.fail(
      new IncompatibleLaunchSelection({
        appId: input.appId,
        runtimeId: input.runtime?.id,
        systemId: input.systemId,
        reason: `runtime ${input.runtime?.id} requires app ${expectedApp}`,
      }),
    )
  }

  const supportedSystems = input.runtime?.supports?.systems
  if (
    supportedSystems !== undefined &&
    !supportedSystems.includes(input.systemId)
  ) {
    return Effect.fail(
      new IncompatibleLaunchSelection({
        appId: input.appId,
        runtimeId: input.runtime?.id,
        systemId: input.systemId,
        reason: `runtime ${input.runtime?.id} does not support system ${input.systemId}`,
      }),
    )
  }

  if (
    input.app.systems !== undefined &&
    input.app.systems.length > 0 &&
    !input.app.systems.includes(input.systemId)
  ) {
    return Effect.fail(
      new IncompatibleLaunchSelection({
        appId: input.appId,
        runtimeId: input.runtime?.id,
        systemId: input.systemId,
        reason: `app ${input.appId} does not support system ${input.systemId}`,
      }),
    )
  }

  return Effect.void
}

const readableViewOfRuntime = (
  runtime: RuntimeRecord | undefined,
): ReadableLayerView =>
  runtime
    ? {
        launchCompanions: launchCompanionsFromLaunch(runtime),
        moonlight: runtime.moonlight,
        plugin: runtime.plugin,
        env: runtime.env,
        cwd: runtime.cwd,
        argsAppend: runtime.argsAppend,
        patches: runtime.patches,
      }
    : {}

const readableViewOfLibraryItem = (
  item: LibraryItemRecord,
): ReadableLayerView => ({
  launchCompanions: launchCompanionsFromLaunch(item),
  moonlight: item.moonlight,
  plugin: item.plugin,
  env: item.env,
  cwd: item.cwd,
  argsAppend: item.argsAppend,
  patches: item.patches,
})

const readableViewOfContained = (entry: PlayableEntry): ReadableLayerView => ({
  launchCompanions: entry.contained
    ? launchCompanionsFromLaunch(entry.contained)
    : undefined,
  moonlight: entry.contained?.moonlight,
  plugin: entry.contained?.plugin,
  env: entry.contained?.env,
  cwd: entry.contained?.cwd,
  argsAppend: entry.contained?.argsAppend,
  patches: entry.contained?.patches,
})

const readableViewOfRelease = (
  release: LibraryReleasePayload,
  app: AppRecord | undefined,
): ReadableLayerView => ({
  launchCompanions: release.launch?.with,
  moonlight: release.moonlight,
  plugin: pluginPolicyFromSettings(
    app?.plugin ?? release.launch?.plugin,
    release.launch?.settings,
    { allowContentPath: false },
  ),
  settings: release.launch?.settings,
  env: release.launch?.env ?? release.env,
  cwd: release.launch?.cwd ?? release.cwd,
  argsAppend: release.launch?.argsAppend ?? release.argsAppend,
  patches: release.patches,
  // Raw escape hatch — release-scoped only (never the ephemeral layer).
  overrides: release.launch?.overrides,
})

const readableViewOfProfile = (
  profile: ProfileRecord | undefined,
): ReadableLayerView =>
  profile
    ? {
        launchCompanions: launchCompanionsFromLaunch(profile),
        moonlight: profile.moonlight,
        plugin: profile.plugin,
        env: profile.env,
        cwd: profile.cwd,
        argsAppend: profile.argsAppend,
        patches: profile.patches,
      }
    : {}

const readableViewOfOverride = (
  override: ReadableOverride | undefined,
): ReadableLayerView =>
  override
    ? {
        launchCompanions: launchCompanionsFromLaunch(override),
        moonlight: override.moonlight,
        plugin: override.plugin,
        env: override.env,
        cwd: override.cwd,
        argsAppend: override.argsAppend,
        patches: override.patches,
      }
    : {}

const mergeReadableLayers = (
  layers: readonly ReadableLayerView[],
): ReadableLayerView => {
  let launchCompanions: LaunchCompanionMap | undefined
  let moonlight: MoonlightPolicy | undefined
  let plugin: PluginPolicyMap | undefined
  let settings: LaunchSettings | undefined
  let env: Record<string, string> | undefined
  let cwd: string | undefined
  let argsAppend: string[] | undefined
  let patches: string[] | undefined
  let overrides: LaunchOverrides | undefined

  for (const layer of layers) {
    const layerCompanions =
      layer.launchCompanions ?? launchCompanionsFromLaunch(layer)
    if (layerCompanions !== undefined) {
      launchCompanions = foldLaunchCompanions(launchCompanions, layerCompanions)
    }
    if (layer.moonlight !== undefined) {
      moonlight = foldMoonlight(moonlight, layer.moonlight)
    }
    if (layer.plugin !== undefined) {
      plugin = foldPluginPolicies(plugin, layer.plugin)
    }
    if (layer.settings !== undefined) {
      settings = mergeLaunchSettings(settings, layer.settings)
    }
    if (layer.env !== undefined) env = { ...(env ?? {}), ...layer.env }
    if (layer.cwd !== undefined) cwd = layer.cwd
    if (layer.argsAppend !== undefined) {
      argsAppend = [...(argsAppend ?? []), ...layer.argsAppend]
    }
    if (layer.patches !== undefined) {
      patches = [...(patches ?? []), ...layer.patches]
    }
    if (layer.overrides !== undefined) {
      overrides = foldLaunchOverrides(overrides, layer.overrides)
    }
  }

  return {
    launchCompanions,
    moonlight,
    plugin,
    settings,
    env,
    cwd,
    argsAppend,
    patches,
    overrides,
  }
}

const selectReadableRelease = (
  playableId: string,
  releases: readonly LibraryReleasePayload[],
  releaseId: string | undefined,
) => {
  const selected = selectLaunchableRelease(releases, releaseId)
  switch (selected._tag) {
    case "SelectedRelease":
      return Effect.succeed(selected.release)
    case "ReleaseNotFound":
      return Effect.fail(new ReleaseNotFound({ releaseId: selected.releaseId }))
    case "ReleaseNotLaunchable":
      return Effect.fail(
        new ReleaseNotLaunchable({ releaseId: selected.releaseId }),
      )
    case "NoLaunchableRelease":
      return Effect.fail(new NoLaunchableRelease({ playableId }))
    case "AmbiguousRelease":
      return Effect.fail(
        new AmbiguousRelease({
          playableId,
          releaseIds: selected.launchableReleaseIds,
        }),
      )
  }
}

export const resolveReadableLocalLauncherPolicy = (
  snapshot: ReadableConfigSnapshot,
  inputs: ResolveReadableLocalLauncherPolicyInputs,
): ResolvedLocalLauncherPolicy => {
  const app = resolveReadableLauncherRecord(
    inputs.launcherId,
    snapshot.readableLaunchers,
  )
  const folded = mergeReadableLayers([
    snapshot.host ?? {},
    readableViewOfApp(app),
    readableViewOfOverride(inputs.override),
  ])
  return {
    launchCompanions: folded.launchCompanions ?? {},
    ...(folded.moonlight ? { moonlight: folded.moonlight } : {}),
  }
}

export const resolveReadableLaunchContext = (
  snapshot: ReadableConfigSnapshot,
  inputs: ResolveReadableLaunchInputs,
): Effect.Effect<ReadableResolvedLaunchContext, unknown> =>
  Effect.gen(function* () {
    const parsed = splitPlayableId(inputs.playableId)
    const item = snapshot.library.get(parsed.itemId)
    if (item === undefined) {
      return yield* Effect.fail(
        new PlayableNotFound({ playableId: inputs.playableId }),
      )
    }

    const entry = listPlayableEntries([item]).find(
      candidate => candidate.id === inputs.playableId,
    )
    if (entry === undefined) {
      return yield* Effect.fail(
        new PlayableNotFound({ playableId: inputs.playableId }),
      )
    }

    const release = yield* selectReadableRelease(
      inputs.playableId,
      entry.releases,
      inputs.releaseId,
    )
    const user =
      inputs.userId === undefined
        ? undefined
        : snapshot.users.get(inputs.userId)
    if (inputs.userId !== undefined && user === undefined) {
      return yield* Effect.fail(new UserNotFound({ userId: inputs.userId }))
    }

    const profile =
      inputs.profileId === undefined
        ? undefined
        : snapshot.profiles.get(inputs.profileId)
    if (inputs.profileId !== undefined && profile === undefined) {
      return yield* Effect.fail(
        new PresetNotFound({
          presetId: inputs.profileId,
          gameId: inputs.playableId,
        }),
      )
    }

    const system = snapshot.systems.get(release.system)
    const explicitAppId = inputs.appId ?? release.launch?.use
    const selection = resolveReadableLauncherSelection({
      explicitAppId,
      pluginId: release.launch?.plugin,
      systemId: release.system,
      readableLaunchers: snapshot.readableLaunchers,
    })
    if (selection === undefined) {
      return yield* Effect.fail(
        new ReleaseNotLaunchable({ releaseId: release.id }),
      )
    }
    if (selection._tag === "NotFound") {
      return yield* Effect.fail(new AppNotFound({ appId: selection.appId }))
    }
    if (selection._tag === "Ambiguous") {
      return yield* Effect.fail(
        new IncompatibleLaunchSelection({
          appId: selection.pluginId,
          systemId: release.system,
          reason: `plugin ${selection.pluginId} matches multiple launchers: ${selection.appIds.join(", ")}`,
        }),
      )
    }
    const { appId, app } = selection
    const runtimeId = release.launch?.runtime ?? app.runtime
    const runtime =
      runtimeId === undefined ? undefined : snapshot.runtimes.get(runtimeId)
    if (runtimeId !== undefined && runtime === undefined) {
      return yield* Effect.fail(new RuntimeNotFound({ runtimeId }))
    }
    yield* validateReadableLaunchCompatibility({
      appId,
      app,
      runtime,
      systemId: release.system,
    })

    const folded = mergeReadableLayers([
      snapshot.host ?? {},
      readableViewOfUser(user),
      readableViewOfSystem(system),
      readableViewOfApp(app),
      readableViewOfRuntime(runtime),
      readableViewOfLibraryItem(item),
      readableViewOfContained(entry),
      readableViewOfRelease(release, app),
      readableViewOfProfile(profile),
      readableViewOfOverride(inputs.override),
    ])

    const target = release.target
    if (target === undefined) {
      return yield* Effect.fail(
        new ReleaseNotLaunchable({ releaseId: release.id }),
      )
    }

    const resolvedTarget = yield* resolveReleaseTarget({
      target: target as ReleaseTargetAtom,
      storage: snapshot.storage,
      input: release.launch?.input,
    })

    return {
      playableId: inputs.playableId,
      itemId: parsed.itemId,
      ...(parsed.containedId !== undefined
        ? { containedId: parsed.containedId }
        : {}),
      releaseId: release.id,
      system: release.system,
      target: resolvedTarget.target,
      app,
      ...(runtime ? { runtime } : {}),
      ...(resolvedTarget.content ? { content: resolvedTarget.content } : {}),
      launchCompanions: folded.launchCompanions ?? {},
      ...(folded.moonlight ? { moonlight: folded.moonlight } : {}),
      ...(folded.plugin ? { plugin: folded.plugin } : {}),
      ...(folded.settings ? { settings: folded.settings } : {}),
      storage: Object.fromEntries(snapshot.storage),
      ...(folded.env ? { env: folded.env } : {}),
      ...(folded.cwd !== undefined ? { cwd: folded.cwd } : {}),
      ...(folded.argsAppend ? { argsAppend: folded.argsAppend } : {}),
      ...(folded.patches ? { patches: folded.patches } : {}),
      ...(folded.overrides ? { overrides: folded.overrides } : {}),
    }
  })
