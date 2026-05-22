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

import { Effect } from "effect"

import type { EphemeralOverride } from "./ephemeral-override"
import {
  CoreNotConfigured,
  GameNotFound,
  LauncherUnresolvable,
  PresetNotFound,
  type ResolutionError,
  UserNotFound,
} from "./errors"
import type { ByLauncherPayload, GamescopePolicy } from "./inheritable-fields"
import type { CollectionRecord } from "./records/collection"
import type { GameRecord } from "./records/game"
import type { GlobalConfigRecord } from "./records/global"
import type { LauncherRecord } from "./records/launcher"
import type { PresetPayload } from "./records/preset"
import type { SystemRecord } from "./records/system"
import type { UserRecord } from "./records/user"
import type { ResolvedLaunchContext } from "./resolved-launch-context"

// ────────────────────────────────────────────────────────────────────
// Snapshot types
// ────────────────────────────────────────────────────────────────────

export interface ConfigSnapshot {
  readonly global: GlobalConfigRecord | null
  readonly users: ReadonlyMap<string, UserRecord>
  readonly systems: ReadonlyMap<string, SystemRecord>
  readonly launchers: ReadonlyMap<string, LauncherRecord>
  readonly games: ReadonlyMap<string, GameRecord>
  readonly collections: ReadonlyMap<string, CollectionRecord>
}

export const emptySnapshot = (): ConfigSnapshot => ({
  global: null,
  users: new Map(),
  systems: new Map(),
  launchers: new Map(),
  games: new Map(),
  collections: new Map(),
})

export interface ResolveInputs {
  readonly gameId: string
  readonly userId?: string
  readonly presetId?: string
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
  readonly byLauncher?: ByLauncherPayload
  readonly launcher?: string
}

const viewOfGlobal = (g: GlobalConfigRecord | null): InheritableView =>
  g
    ? {
        launcher: g.launcher,
        gamescope: g.gamescope,
        env: g.env,
        cwd: g.cwd,
        argsAppend: g.argsAppend,
        byLauncher: g.byLauncher,
      }
    : {}

const viewOfUser = (u: UserRecord | undefined): InheritableView =>
  u
    ? {
        launcher: u.launcher,
        inherit: u.inherit,
        gamescope: u.gamescope,
        env: u.env,
        cwd: u.cwd,
        argsAppend: u.argsAppend,
        byLauncher: u.byLauncher,
      }
    : {}

const viewOfSystem = (s: SystemRecord | undefined): InheritableView =>
  s
    ? {
        launcher: s.launcher,
        inherit: s.inherit,
        gamescope: s.gamescope,
        env: s.env,
        cwd: s.cwd,
        argsAppend: s.argsAppend,
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
        byLauncher: l.byLauncher,
      }
    : {}

const viewOfGame = (g: GameRecord): InheritableView => ({
  launcher: g.launcher,
  inherit: g.inherit,
  gamescope: g.gamescope,
  env: g.env,
  cwd: g.cwd,
  argsAppend: g.argsAppend,
  byLauncher: g.byLauncher,
})

const viewOfPreset = (p: PresetPayload): InheritableView => ({
  launcher: p.launcher,
  inherit: p.inherit,
  gamescope: p.gamescope,
  env: p.env,
  cwd: p.cwd,
  argsAppend: p.argsAppend,
  byLauncher: p.byLauncher,
})

const viewOfOverride = (o: EphemeralOverride): InheritableView => ({
  launcher: o.launcher,
  inherit: o.inherit,
  gamescope: o.gamescope,
  env: o.env,
  cwd: o.cwd,
  argsAppend: o.argsAppend,
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
  let launcher: string | undefined

  const mergeView = (view: InheritableView) => {
    // Merge byLauncher[L] INTO this view first, then fold the result.
    const merged: InheritableView =
      view.byLauncher && resolvedLauncherId
        ? mergeByLauncher(view, view.byLauncher[resolvedLauncherId])
        : view

    if (merged.launcher !== undefined) launcher = merged.launcher

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
  }

  for (const view of active) mergeView(view)

  return { gamescope, env, cwd, argsAppend, launcher }
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
  }
}

/** Deep-merge two gamescope policies; `args` concat, `enabled` last-wins. */
const foldGamescope = (
  base: GamescopePolicy | undefined,
  extra: GamescopePolicy,
): GamescopePolicy => {
  const enabled = extra.enabled !== undefined ? extra.enabled : base?.enabled
  const args =
    extra.args !== undefined
      ? [...(base?.args ?? []), ...extra.args]
      : base?.args
  return {
    ...(enabled !== undefined ? { enabled } : {}),
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
  if (game.launcher) return game.launcher
  const sys = snap.systems.get(game.system)
  if (sys?.launcher) return sys.launcher
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launcher) return usr.launcher
  }
  return snap.global?.launcher
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
  if (inputs.override?.launcher) return inputs.override.launcher
  if (selectedChain) {
    for (let i = selectedChain.length - 1; i >= 0; i--) {
      const p = selectedChain[i]?.payload
      if (p?.launcher) return p.launcher
    }
  }
  if (game.launcher) return game.launcher
  const sys = snap.systems.get(game.system)
  if (sys?.launcher) return sys.launcher
  if (inputs.userId) {
    const usr = snap.users.get(inputs.userId)
    if (usr?.launcher) return usr.launcher
  }
  return snap.global?.launcher
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
    const lncher = snap.launchers.get(launcherId)
    if (!lncher) {
      return yield* Effect.fail(
        new LauncherUnresolvable({ gameId: inputs.gameId }),
      )
    }

    // Pass 2 — build the layer stack least → most specific.
    const sys = snap.systems.get(game.system)
    const user = inputs.userId ? snap.users.get(inputs.userId) : undefined

    const presetView = selectedChain
      ? foldLayers(
          selectedChain.map(l => viewOfPreset(l.payload)),
          launcherId,
        )
      : undefined

    const layers: InheritableView[] = [
      viewOfGlobal(snap.global),
      viewOfUser(user),
      viewOfSystem(sys),
      viewOfLauncher(lncher),
      viewOfGame(game),
    ]
    if (presetView) layers.push(presetView)
    if (inputs.override) layers.push(viewOfOverride(inputs.override))

    const folded = foldLayers(layers, launcherId)

    // Cross-validation: if the launcher's template references {core}, the
    // cascade must have produced one (game.core, system.cores[L], or
    // similar).
    const core = game.core ?? sys?.cores?.[launcherId] ?? undefined
    if (referencesPlaceholder(lncher.args, "core") && core === undefined) {
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
      contentPath: game.contentPath,
      system: game.system,
      launcherId,
      ...(core !== undefined ? { core } : {}),
      ...(folded.gamescope ? { gamescope: folded.gamescope } : {}),
      ...(folded.env ? { env: folded.env } : {}),
      ...(folded.cwd !== undefined ? { cwd: folded.cwd } : {}),
      ...(folded.argsAppend ? { argsAppend: folded.argsAppend } : {}),
    }
    return context
  })
