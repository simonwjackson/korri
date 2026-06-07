/**
 * Cascade resolver — the heart of the seven-layer config model.
 *
 * Two pure functions:
 * - `enumerateApplicablePresets(snapshot, inputs)` returns the
 *   user-facing preset menu as `Map<presetName, ResolvedPreset[]>`.
 *   Each chain is ordered least-specific → most-specific with
 *   `inherit: false` truncation applied.
 * - `resolveLaunchContext(snapshot, inputs)` walks all seven layers in
 *   inheritance order (global → user → system → launcher → game →
 *   preset chain → ephemeral override), deep-merging contributions
 *   per the rules in the plan, and returns a `ResolvedLaunchContext`.
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
  resolveAppDescriptor,
} from "./app-integrations"
import type { EphemeralOverride } from "./ephemeral-override"
import {
  AppNotFound,
  CoreNotConfigured,
  GameNotFound,
  LauncherUnresolvable,
  PresetNotFound,
  type ResolutionError,
  UserNotFound,
} from "./errors"
import {
  type ByLauncherPayload,
  type GamescopePolicy,
  normalizeGamescopePolicy,
} from "./inheritable-fields"
import type { LaunchBlock, LaunchSettings } from "./launch-block"
import { mergeLaunchSettings } from "./launch-block"
import { resolveModuleSelection } from "./module-resolution"
import {
  listPlayableEntries,
  type PlayableEntry,
  selectLaunchableRelease,
  splitPlayableId,
} from "./playable-id"
import type { AppRecord } from "./records/app"
import type { CollectionRecord } from "./records/collection"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { HostRecord } from "./records/host"
import type { LauncherRecord } from "./records/launcher"
import type {
  LibraryItemRecord,
  LibraryReleasePayload,
} from "./records/library-item"
import type { ModuleRecord } from "./records/module"
import type { PresetPayload } from "./records/preset"
import type { ProfileRecord } from "./records/profile"
import type { RuntimeRecord } from "./records/runtime"
import type { SourceRecord } from "./records/source"
import type { StorageRecord } from "./records/storage"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"
import type {
  ReadableResolvedLaunchContext,
  ResolvedLaunchContext,
} from "./resolved-launch-context"
import { resolveSourceTarget } from "./source-target-resolution"

// ────────────────────────────────────────────────────────────────────
// Snapshot types
// ────────────────────────────────────────────────────────────────────

export interface ConfigSnapshot {
  readonly global: GlobalConfigRecord | null
  readonly users: ReadonlyMap<string, UserRecord>
  readonly systems: ReadonlyMap<string, SystemRecord>
  readonly launchers: ReadonlyMap<string, LauncherRecord>
  readonly apps: ReadonlyMap<string, AppRecord>
  readonly modules: ReadonlyMap<string, ModuleRecord>
  readonly games: ReadonlyMap<string, GameRecord>
  readonly collections: ReadonlyMap<string, CollectionRecord>
}

export const emptySnapshot = (): ConfigSnapshot => ({
  global: null,
  users: new Map(),
  systems: new Map(),
  launchers: new Map(),
  apps: new Map(),
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

export interface ResolveLocalLauncherGamescopePolicyInputs {
  readonly launcherId: string
  readonly override?: EphemeralOverride
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
  readonly gamescope?: GamescopePolicy
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

const viewOfGlobal = (g: GlobalConfigRecord | null): InheritableView =>
  g
    ? {
        launch: g.launch,
        launcher: g.launch?.app ?? g.launcher,
        module: g.launch?.module,
        settings: g.launch?.settings,
        gamescope: g.gamescope,
        env: g.env,
        cwd: g.cwd,
        argsAppend: g.argsAppend,
        patches: g.patches,
        byLauncher: g.byLauncher,
      }
    : {}

const viewOfUser = (u: UserRecord | undefined): InheritableView =>
  u
    ? {
        launch: u.launch,
        launcher: u.launch?.app ?? u.launcher,
        module: u.launch?.module,
        settings: u.launch?.settings,
        inherit: u.inherit,
        gamescope: u.gamescope,
        env: u.env,
        cwd: u.cwd,
        argsAppend: u.argsAppend,
        patches: u.patches,
        byLauncher: u.byLauncher,
      }
    : {}

const viewOfSystem = (s: SystemRecord | undefined): InheritableView =>
  s
    ? {
        launch: s.launch,
        launcher: s.launch?.app ?? s.launcher,
        module: s.launch?.module,
        settings: s.launch?.settings,
        inherit: s.inherit,
        gamescope: s.gamescope,
        env: s.env,
        cwd: s.cwd,
        argsAppend: s.argsAppend,
        patches: s.patches,
        byLauncher: s.byLauncher,
      }
    : {}

const viewOfLauncher = (l: LauncherRecord | undefined): InheritableView =>
  l
    ? {
        inherit: l.inherit,
        gamescope: l.gamescope,
        env: l.env,
        cwd: l.cwd,
        argsAppend: l.argsAppend,
        patches: l.patches,
        byLauncher: l.byLauncher,
      }
    : {}

const viewOfGame = (g: GameRecord): InheritableView => ({
  launch: g.launch,
  launcher: g.launch?.app ?? g.launcher,
  module: g.launch?.module ?? g.core,
  settings: g.launch?.settings,
  inherit: g.inherit,
  gamescope: g.gamescope,
  env: g.env,
  cwd: g.cwd,
  argsAppend: g.argsAppend,
  patches: g.patches,
  byLauncher: g.byLauncher,
})

const viewOfPreset = (p: PresetPayload): InheritableView => ({
  launch: p.launch,
  launcher: p.launch?.app ?? p.launcher,
  module: p.launch?.module,
  settings: p.launch?.settings,
  inherit: p.inherit,
  gamescope: p.gamescope,
  env: p.env,
  cwd: p.cwd,
  argsAppend: p.argsAppend,
  patches: p.patches,
  byLauncher: p.byLauncher,
})

const viewOfOverride = (o: EphemeralOverride): InheritableView => ({
  launch: o.launch,
  launcher: o.launch?.app ?? o.launcher,
  module: o.launch?.module,
  settings: o.launch?.settings,
  inherit: o.inherit,
  gamescope: o.gamescope,
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
 * - `gamescope`     → deep-merge per nested key; `args` concat; scalars
 *   last-wins; explicit `false` overrides inherited `true`.
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

  let gamescope: GamescopePolicy | undefined
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
    if (merged.gamescope !== undefined) {
      gamescope = foldGamescope(gamescope, merged.gamescope)
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
    gamescope,
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
  return {
    ...base,
    gamescope: extra.gamescope
      ? foldGamescope(base.gamescope, extra.gamescope)
      : base.gamescope,
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

/** Deep-merge two gamescope policies; `args` concat, scalars last-win. */
const foldGamescope = (
  base: GamescopePolicy | undefined,
  extra: GamescopePolicy,
): GamescopePolicy => {
  const enabled = extra.enabled !== undefined ? extra.enabled : base?.enabled
  const command = extra.command !== undefined ? extra.command : base?.command
  const backend = extra.backend !== undefined ? extra.backend : base?.backend
  const exposeWayland =
    extra.exposeWayland !== undefined
      ? extra.exposeWayland
      : base?.exposeWayland
  const forceXwayland =
    extra.forceXwayland !== undefined
      ? extra.forceXwayland
      : base?.forceXwayland
  const args =
    extra.args !== undefined
      ? [...(base?.args ?? []), ...extra.args]
      : base?.args
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(backend !== undefined ? { backend } : {}),
    ...(exposeWayland !== undefined ? { exposeWayland } : {}),
    ...(forceXwayland !== undefined ? { forceXwayland } : {}),
    ...(args !== undefined ? { args } : {}),
  }
}

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
  const sys = snap.systems.get(game.system)
  if (sys?.launch?.app ?? sys?.launcher)
    return sys?.launch?.app ?? sys?.launcher
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launch?.app ?? usr?.launcher)
      return usr?.launch?.app ?? usr?.launcher
  }
  return snap.global?.launch?.app ?? snap.global?.launcher
}

/**
 * Final resolved launcher — scans override → selected preset chain
 * (most→least specific) → game → system → user → global.
 */
const resolveLauncherId = (
  snap: ConfigSnapshot,
  inputs: ResolveInputs,
  game: GameRecord,
  selectedChain: readonly ResolvedPresetLink[] | undefined,
): string | undefined => {
  if (inputs.override?.launch?.app ?? inputs.override?.launcher) {
    return inputs.override?.launch?.app ?? inputs.override?.launcher
  }
  if (selectedChain) {
    for (let i = selectedChain.length - 1; i >= 0; i--) {
      const p = selectedChain[i]?.payload
      if (p?.launch?.app ?? p?.launcher) return p?.launch?.app ?? p?.launcher
    }
  }
  if (game.launch?.app ?? game.launcher)
    return game.launch?.app ?? game.launcher
  const sys = snap.systems.get(game.system)
  if (sys?.launch?.app ?? sys?.launcher)
    return sys?.launch?.app ?? sys?.launcher
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
    | SystemRecord
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

export const resolveLocalLauncherGamescopePolicy = (
  snap: ConfigSnapshot,
  inputs: ResolveLocalLauncherGamescopePolicyInputs,
): GamescopePolicy => {
  const layers: InheritableView[] = [
    viewOfGlobal(snap.global),
    viewOfLauncher(snap.launchers.get(inputs.launcherId)),
  ]
  if (inputs.override) layers.push(viewOfOverride(inputs.override))

  const folded = foldLayers(layers, inputs.launcherId)
  return normalizeGamescopePolicy(folded.gamescope)
}

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
    const sys = snap.systems.get(game.system)
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
    for (const { name, link } of presetsOnLayer("system", sys)) push(name, link)
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
// Pass 2 — full cascade
// ────────────────────────────────────────────────────────────────────

const referencesPlaceholder = (
  template: readonly string[],
  placeholder: string,
): boolean => template.some(s => s.includes(`{${placeholder}}`))

const resolveExplicitLaunchApp = (
  snap: ConfigSnapshot,
  inputs: ResolveInputs,
  game: GameRecord,
  selectedChain: readonly ResolvedPresetLink[] | undefined,
): string | undefined => {
  if (inputs.override?.launch?.app) return inputs.override.launch.app
  if (selectedChain) {
    for (let i = selectedChain.length - 1; i >= 0; i--) {
      const appId = selectedChain[i]?.payload.launch?.app
      if (appId) return appId
    }
  }
  if (game.launch?.app) return game.launch.app
  const sys = snap.systems.get(game.system)
  if (sys?.launch?.app) return sys.launch.app
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launch?.app) return usr.launch.app
  }
  return snap.global?.launch?.app
}

const resolveExplicitLaunchModule = (
  snap: ConfigSnapshot,
  inputs: ResolveInputs,
  game: GameRecord,
  selectedChain: readonly ResolvedPresetLink[] | undefined,
): string | undefined => {
  if (inputs.override?.launch?.module) return inputs.override.launch.module
  if (selectedChain) {
    for (let i = selectedChain.length - 1; i >= 0; i--) {
      const moduleId = selectedChain[i]?.payload.launch?.module
      if (moduleId) return moduleId
    }
  }
  if (game.launch?.module) return game.launch.module
  const sys = snap.systems.get(game.system)
  if (sys?.launch?.module) return sys.launch.module
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launch?.module) return usr.launch.module
  }
  return snap.global?.launch?.module
}

export const resolveLaunchContext = (
  snap: ConfigSnapshot,
  inputs: ResolveInputs,
): Effect.Effect<ResolvedLaunchContext, ResolutionError> =>
  Effect.gen(function* () {
    const game = snap.games.get(inputs.gameId)
    if (!game) {
      return yield* Effect.fail(new GameNotFound({ gameId: inputs.gameId }))
    }

    if (inputs.userId !== undefined && !snap.users.has(inputs.userId)) {
      return yield* Effect.fail(new UserNotFound({ userId: inputs.userId }))
    }

    // Pass 1 — enumerate presets (also catches GameNotFound/UserNotFound
    // upstream, but we already did those checks above for clearer error
    // ordering).
    const menu = yield* enumerateApplicablePresets(snap, inputs)
    let selectedChain: readonly ResolvedPresetLink[] | undefined
    if (inputs.presetId !== undefined) {
      const chain = menu.get(inputs.presetId)
      if (!chain || chain.length === 0) {
        return yield* Effect.fail(
          new PresetNotFound({
            presetId: inputs.presetId,
            gameId: inputs.gameId,
          }),
        )
      }
      selectedChain = chain
    }

    // Pass 0 — skeleton: resolve final launcher.
    const launcherId = resolveLauncherId(snap, inputs, game, selectedChain)
    if (!launcherId) {
      return yield* Effect.fail(
        new LauncherUnresolvable({ gameId: inputs.gameId }),
      )
    }
    const apps = snap.apps ?? new Map()
    const modules = snap.modules ?? new Map()
    const hasKnownApp =
      getBuiltInAppDescriptor(launcherId) !== undefined ||
      apps.has(launcherId) ||
      snap.launchers.has(launcherId)
    if (!hasKnownApp) {
      const explicitApp = resolveExplicitLaunchApp(
        snap,
        inputs,
        game,
        selectedChain,
      )
      return yield* Effect.fail(
        explicitApp !== undefined
          ? new AppNotFound({ appId: launcherId })
          : new LauncherUnresolvable({ gameId: inputs.gameId }),
      )
    }
    const app = yield* resolveAppDescriptor({
      appId: launcherId,
      apps,
      launchers: snap.launchers,
    })

    // Pass 2 — build the layer stack least → most specific.
    const sys = snap.systems.get(game.system)
    const user = inputs.userId ? snap.users.get(inputs.userId) : undefined

    const presetView = selectedChain
      ? foldLayers(
          selectedChain.map(l => viewOfPreset(l.payload)),
          launcherId,
        )
      : undefined

    const appRecord = apps.get(launcherId)
    const appView: InheritableView = {
      settings: mergeLaunchSettings(
        getBuiltInAppDescriptor(launcherId)?.settings,
        appRecord?.settings,
      ),
      gamescope: appRecord?.gamescope,
      env: appRecord?.env,
      cwd: appRecord?.cwd,
      argsAppend: appRecord?.argsAppend,
      patches: appRecord?.patches,
    }

    const layers: InheritableView[] = [
      viewOfGlobal(snap.global),
      viewOfUser(user),
      viewOfSystem(sys),
      appView,
      viewOfLauncher(snap.launchers.get(launcherId)),
      viewOfGame(game),
    ]
    if (presetView) layers.push(presetView)
    if (inputs.override) layers.push(viewOfOverride(inputs.override))

    const folded = foldLayers(layers, launcherId)

    const explicitModule = resolveExplicitLaunchModule(
      snap,
      inputs,
      game,
      selectedChain,
    )
    const legacyCore = game.core ?? sys?.cores?.[launcherId] ?? undefined
    const selectedModule = yield* resolveModuleSelection({
      app,
      modules,
      moduleId: explicitModule ?? legacyCore,
      explicitLaunchModule: explicitModule !== undefined,
    })
    const core = selectedModule.modulePath ?? selectedModule.legacyCore

    if (
      (referencesPlaceholder([app.command, ...app.args], "core") ||
        referencesPlaceholder([app.command, ...app.args], "modulePath")) &&
      core === undefined
    ) {
      return yield* Effect.fail(
        new CoreNotConfigured({
          gameId: inputs.gameId,
          systemId: game.system,
          launcherId,
        }),
      )
    }

    const context: ResolvedLaunchContext = {
      gameId: inputs.gameId,
      ...(game.contentPath !== undefined
        ? { contentPath: game.contentPath }
        : {}),
      ...(game.content !== undefined ? { content: game.content } : {}),
      system: game.system,
      launcherId,
      appId: launcherId,
      ...(selectedModule.moduleId !== undefined
        ? { moduleId: selectedModule.moduleId }
        : {}),
      ...(selectedModule.modulePath !== undefined
        ? { modulePath: selectedModule.modulePath }
        : {}),
      ...(core !== undefined ? { core } : {}),
      gamescope: normalizeGamescopePolicy(folded.gamescope),
      ...(folded.settings ? { settings: folded.settings } : {}),
      ...(folded.env ? { env: folded.env } : {}),
      ...(folded.cwd !== undefined ? { cwd: folded.cwd } : {}),
      ...(folded.argsAppend ? { argsAppend: folded.argsAppend } : {}),
      ...(folded.patches ? { patches: folded.patches } : {}),
    }
    return context
  })

// ────────────────────────────────────────────────────────────────────
// Readable schema cascade (host → user → system → source → app → runtime
// → library item → contained playable → release → profile → override)
// ────────────────────────────────────────────────────────────────────

export interface ReadableConfigSnapshot {
  readonly host: HostRecord | null
  readonly users: ReadonlyMap<string, UserRecord>
  readonly systems: ReadonlyMap<string, SystemRecord>
  readonly sources: ReadonlyMap<string, SourceRecord>
  readonly apps: ReadonlyMap<string, AppRecord>
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

export class SourceUnresolvable extends Data.TaggedError("SourceUnresolvable")<{
  readonly playableId: string
  readonly releaseId: string
}> {}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly runtimeId: string
}> {}

export class MultiTargetUnsupported extends Data.TaggedError(
  "MultiTargetUnsupported",
)<{
  readonly playableId: string
  readonly releaseId: string
}> {}

interface ReadableOverride {
  readonly app?: string
  readonly runtime?: string
  readonly gamescope?: GamescopePolicy
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
}

export interface ResolveReadableLaunchInputs {
  readonly playableId: string
  readonly releaseId?: string
  readonly userId?: string
  readonly profileId?: string
  readonly override?: ReadableOverride
}

interface ReadableLayerView {
  readonly app?: string
  readonly runtime?: string
  readonly gamescope?: GamescopePolicy
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
}

const readableViewOfUser = (user: UserRecord | undefined): ReadableLayerView =>
  user
    ? {
        app: user.launch?.app ?? user.launcher,
        runtime: user.launch?.module,
        gamescope: user.gamescope,
        env: user.env,
        cwd: user.cwd,
        argsAppend: user.argsAppend,
        patches: user.patches,
      }
    : {}

const readableViewOfSystem = (
  system: SystemRecord | undefined,
): ReadableLayerView =>
  system
    ? {
        app: system.launch?.app ?? system.launcher,
        runtime: system.launch?.module,
        gamescope: system.gamescope,
        env: system.env,
        cwd: system.cwd,
        argsAppend: system.argsAppend,
        patches: system.patches,
      }
    : {}

const readableViewOfSource = (
  source: SourceRecord | undefined,
): ReadableLayerView =>
  source
    ? {
        app: source.app,
        runtime: source.runtime,
        gamescope: source.gamescope,
        env: source.env,
        cwd: source.cwd,
        argsAppend: source.argsAppend,
        patches: source.patches,
      }
    : {}

const readableViewOfApp = (app: AppRecord | undefined): ReadableLayerView =>
  app
    ? {
        gamescope: app.gamescope,
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
  if (appId === "retroarch") return ["-L", "{runtime.path}", "{content.path}"]
  if (appId === "mame") return ["{content.path}"]
  if (appId === "dolphin") return ["--batch", "--exec", "{content.path}"]
  if (appId === "solarus") return ["{content.path}"]
  return legacyArgs
}

const resolveReadableAppRecord = (
  appId: string,
  apps: ReadonlyMap<string, AppRecord>,
): AppRecord | undefined => {
  const override = apps.get(appId)
  const builtIn = getBuiltInAppDescriptor(appId)
  if (builtIn === undefined) return override
  return {
    id: appId,
    command: override?.command ?? builtIn.command,
    args: override?.args ?? readableBuiltInArgs(appId, builtIn.args),
    systems: override?.systems ?? builtIn.systems,
    policy: override?.policy ?? builtIn.policy,
    settings: override?.settings ?? builtIn.settings,
    gamescope: override?.gamescope ?? builtIn.gamescope,
    env: override?.env ?? builtIn.env,
    cwd: override?.cwd ?? builtIn.cwd,
    argsAppend: override?.argsAppend ?? builtIn.argsAppend,
    patches: override?.patches,
    inherit: override?.inherit,
    presets: override?.presets ?? builtIn.presets,
  }
}

const readableViewOfRuntime = (
  runtime: RuntimeRecord | undefined,
): ReadableLayerView =>
  runtime
    ? {
        gamescope: runtime.gamescope,
        env: runtime.env,
        cwd: runtime.cwd,
        argsAppend: runtime.argsAppend,
        patches: runtime.patches,
      }
    : {}

const readableViewOfLibraryItem = (
  item: LibraryItemRecord,
): ReadableLayerView => ({
  gamescope: item.gamescope,
  env: item.env,
  cwd: item.cwd,
  argsAppend: item.argsAppend,
  patches: item.patches,
})

const readableViewOfContained = (entry: PlayableEntry): ReadableLayerView => ({
  gamescope: entry.contained?.gamescope,
  env: entry.contained?.env,
  cwd: entry.contained?.cwd,
  argsAppend: entry.contained?.argsAppend,
  patches: entry.contained?.patches,
})

const readableViewOfRelease = (
  release: LibraryReleasePayload,
): ReadableLayerView => ({
  app: release.app,
  runtime: release.runtime,
  gamescope: release.gamescope,
  env: release.env,
  cwd: release.cwd,
  argsAppend: release.argsAppend,
  patches: release.patches,
})

const readableViewOfProfile = (
  profile: ProfileRecord | undefined,
): ReadableLayerView =>
  profile
    ? {
        app: profile.app,
        runtime: profile.runtime,
        gamescope: profile.gamescope,
        env: profile.env,
        cwd: profile.cwd,
        argsAppend: profile.argsAppend,
        patches: profile.patches,
      }
    : {}

const mergeReadableLayers = (
  layers: readonly ReadableLayerView[],
): ReadableLayerView => {
  let app: string | undefined
  let runtime: string | undefined
  let gamescope: GamescopePolicy | undefined
  let env: Record<string, string> | undefined
  let cwd: string | undefined
  let argsAppend: string[] | undefined
  let patches: string[] | undefined

  for (const layer of layers) {
    if (layer.app !== undefined) app = layer.app
    if (layer.runtime !== undefined) runtime = layer.runtime
    if (layer.gamescope !== undefined) {
      gamescope = foldGamescope(gamescope, layer.gamescope)
    }
    if (layer.env !== undefined) env = { ...(env ?? {}), ...layer.env }
    if (layer.cwd !== undefined) cwd = layer.cwd
    if (layer.argsAppend !== undefined) {
      argsAppend = [...(argsAppend ?? []), ...layer.argsAppend]
    }
    if (layer.patches !== undefined) {
      patches = [...(patches ?? []), ...layer.patches]
    }
  }

  return { app, runtime, gamescope, env, cwd, argsAppend, patches }
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

    const baseLayers = [
      snapshot.host ?? {},
      readableViewOfUser(user),
      readableViewOfSystem(snapshot.systems.get(release.system)),
    ]
    const early = mergeReadableLayers(baseLayers)
    const sourceId = release.source ?? item.source
    if (sourceId === undefined) {
      return yield* Effect.fail(
        new SourceUnresolvable({
          playableId: inputs.playableId,
          releaseId: release.id,
        }),
      )
    }
    const source = snapshot.sources.get(sourceId)
    const selected = mergeReadableLayers([
      early,
      readableViewOfSource(source),
      readableViewOfRelease(release),
      readableViewOfProfile(profile),
      inputs.override ?? {},
    ])
    const appId = selected.app
    if (appId === undefined) {
      return yield* Effect.fail(
        new LauncherUnresolvable({ gameId: inputs.playableId }),
      )
    }
    const app = resolveReadableAppRecord(appId, snapshot.apps)
    if (app === undefined) return yield* Effect.fail(new AppNotFound({ appId }))

    const runtimeId = selected.runtime
    const runtime =
      runtimeId === undefined ? undefined : snapshot.runtimes.get(runtimeId)
    if (runtimeId !== undefined && runtime === undefined) {
      return yield* Effect.fail(new RuntimeNotFound({ runtimeId }))
    }

    const folded = mergeReadableLayers([
      snapshot.host ?? {},
      readableViewOfUser(user),
      readableViewOfSystem(snapshot.systems.get(release.system)),
      readableViewOfSource(source),
      readableViewOfApp(app),
      readableViewOfRuntime(runtime),
      readableViewOfLibraryItem(item),
      readableViewOfContained(entry),
      readableViewOfRelease(release),
      readableViewOfProfile(profile),
      inputs.override ?? {},
    ])

    const target = release.target
    if (typeof target !== "string" && target !== undefined) {
      return yield* Effect.fail(
        new MultiTargetUnsupported({
          playableId: inputs.playableId,
          releaseId: release.id,
        }),
      )
    }
    if (target === undefined) {
      return yield* Effect.fail(
        new ReleaseNotLaunchable({ releaseId: release.id }),
      )
    }

    const resolvedTarget = yield* resolveSourceTarget({
      sourceId,
      target,
      sources: snapshot.sources,
      storage: snapshot.storage,
    })

    return {
      playableId: inputs.playableId,
      itemId: parsed.itemId,
      ...(parsed.containedId !== undefined
        ? { containedId: parsed.containedId }
        : {}),
      releaseId: release.id,
      system: release.system,
      sourceId,
      target: resolvedTarget.target,
      app,
      ...(runtime ? { runtime } : {}),
      ...(resolvedTarget.content ? { content: resolvedTarget.content } : {}),
      gamescope: normalizeGamescopePolicy(folded.gamescope),
      ...(folded.env ? { env: folded.env } : {}),
      ...(folded.cwd !== undefined ? { cwd: folded.cwd } : {}),
      ...(folded.argsAppend ? { argsAppend: folded.argsAppend } : {}),
      ...(folded.patches ? { patches: folded.patches } : {}),
    }
  })
