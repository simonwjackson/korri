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
  resolveEffectiveAppChoices,
  selectAppChoice,
} from "./app-choice-selection"
import {
  getBuiltInAppDescriptor,
  mergeBuiltInAppGamescopePolicy,
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
  type GamescopePolicy,
  type MoonlightPolicy,
  normalizeGamescopePolicy,
  type RetroArchPolicy,
  type RyubingPolicy,
  type SteamPolicy,
} from "./inheritable-fields"
import type { LaunchBlock, LaunchSettings } from "./launch-block"
import { mergeLaunchSettings } from "./launch-block"
import {
  listPlayableEntries,
  type PlayableEntry,
  selectLaunchableRelease,
  splitPlayableId,
} from "./playable-id"
import {
  type AppRecord,
  appRecordKind,
  appRetroArchPolicyFromRecord,
  appRyubingPolicyFromRecord,
  appSteamPolicyFromRecord,
} from "./records/app"
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
import type { ReadableResolvedLaunchContext } from "./resolved-launch-context"
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

export interface ResolveLocalLauncherPolicyInputs {
  readonly launcherId: string
  readonly override?: EphemeralOverride
}

export interface ResolvedLocalLauncherPolicy {
  readonly gamescope: GamescopePolicy
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
  readonly gamescope?: GamescopePolicy
  readonly moonlight?: MoonlightPolicy
  readonly retroarch?: RetroArchPolicy
  readonly ryubing?: RyubingPolicy
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
        gamescope: g.gamescope,
        moonlight: g.moonlight,
        retroarch: g.retroarch,
        ryubing: g.ryubing,
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
        gamescope: l.gamescope,
        moonlight: l.moonlight,
        retroarch: l.retroarch,
        ryubing: l.ryubing,
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
  gamescope: o.gamescope,
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
 * - `gamescope`     → deep-merge per nested key; `extraArgs` concat;
 *   scalars last-wins; explicit `false` overrides inherited `true`.
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
  let moonlight: MoonlightPolicy | undefined
  let retroarch: RetroArchPolicy | undefined
  let ryubing: RyubingPolicy | undefined
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
    if (merged.moonlight !== undefined) {
      moonlight = foldMoonlight(moonlight, merged.moonlight)
    }
    if (merged.retroarch !== undefined) {
      retroarch = foldRetroArch(retroarch, merged.retroarch)
    }
    if (merged.ryubing !== undefined) {
      ryubing = foldRyubing(ryubing, merged.ryubing)
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
    moonlight,
    retroarch,
    ryubing,
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
    moonlight: extra.moonlight
      ? foldMoonlight(base.moonlight, extra.moonlight)
      : base.moonlight,
    retroarch: extra.retroarch
      ? foldRetroArch(base.retroarch, extra.retroarch)
      : base.retroarch,
    ryubing: extra.ryubing
      ? foldRyubing(base.ryubing, extra.ryubing)
      : base.ryubing,
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

const lastDefined = <Value>(
  base: Value | undefined,
  extra: Value | undefined,
): Value | undefined => (extra !== undefined ? extra : base)

const mergeEnvironmentOverlay = (
  base: GamescopePolicy["environment"],
  extra: GamescopePolicy["environment"],
): GamescopePolicy["environment"] => {
  if (extra === undefined) return base
  return { ...(base ?? {}), ...extra }
}

const mergeGamescopeBackend = (
  base: GamescopePolicy["backend"],
  extra: GamescopePolicy["backend"],
): GamescopePolicy["backend"] => {
  if (extra === undefined) return base
  const type = lastDefined(base?.type, extra.type)
  const allowDeferred = lastDefined(base?.allowDeferred, extra.allowDeferred)
  const preferVkDevice = lastDefined(base?.preferVkDevice, extra.preferVkDevice)
  return {
    ...(type !== undefined ? { type } : {}),
    ...(allowDeferred !== undefined ? { allowDeferred } : {}),
    ...(preferVkDevice !== undefined ? { preferVkDevice } : {}),
  }
}

const mergeGamescopeWindow = (
  base: GamescopePolicy["window"],
  extra: GamescopePolicy["window"],
): GamescopePolicy["window"] => {
  if (extra === undefined) return base
  const fullscreen = lastDefined(base?.fullscreen, extra.fullscreen)
  const borderless = lastDefined(base?.borderless, extra.borderless)
  const grabKeyboard = lastDefined(base?.grabKeyboard, extra.grabKeyboard)
  const forceGrabCursor = lastDefined(
    base?.forceGrabCursor,
    extra.forceGrabCursor,
  )
  const displayIndex = lastDefined(base?.displayIndex, extra.displayIndex)
  const forceWindowsFullscreen = lastDefined(
    base?.forceWindowsFullscreen,
    extra.forceWindowsFullscreen,
  )
  const exposeWayland = lastDefined(base?.exposeWayland, extra.exposeWayland)
  const xwaylandCount = lastDefined(base?.xwaylandCount, extra.xwaylandCount)
  const fadeOutDuration = lastDefined(
    base?.fadeOutDuration,
    extra.fadeOutDuration,
  )
  return {
    ...(fullscreen !== undefined ? { fullscreen } : {}),
    ...(borderless !== undefined ? { borderless } : {}),
    ...(grabKeyboard !== undefined ? { grabKeyboard } : {}),
    ...(forceGrabCursor !== undefined ? { forceGrabCursor } : {}),
    ...(displayIndex !== undefined ? { displayIndex } : {}),
    ...(forceWindowsFullscreen !== undefined ? { forceWindowsFullscreen } : {}),
    ...(exposeWayland !== undefined ? { exposeWayland } : {}),
    ...(xwaylandCount !== undefined ? { xwaylandCount } : {}),
    ...(fadeOutDuration !== undefined ? { fadeOutDuration } : {}),
  }
}

const mergeGamescopeOutput = (
  base: NonNullable<GamescopePolicy["display"]>["output"],
  extra: NonNullable<GamescopePolicy["display"]>["output"],
): NonNullable<GamescopePolicy["display"]>["output"] => {
  if (extra === undefined) return base
  const width = lastDefined(base?.width, extra.width)
  const height = lastDefined(base?.height, extra.height)
  const preferredConnectors = lastDefined(
    base?.preferredConnectors,
    extra.preferredConnectors,
  )
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(preferredConnectors !== undefined ? { preferredConnectors } : {}),
  }
}

const mergeGamescopeNested = (
  base: NonNullable<GamescopePolicy["display"]>["nested"],
  extra: NonNullable<GamescopePolicy["display"]>["nested"],
): NonNullable<GamescopePolicy["display"]>["nested"] => {
  if (extra === undefined) return base
  const width = lastDefined(base?.width, extra.width)
  const height = lastDefined(base?.height, extra.height)
  const refresh = lastDefined(base?.refresh, extra.refresh)
  const unfocusedRefresh = lastDefined(
    base?.unfocusedRefresh,
    extra.unfocusedRefresh,
  )
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(refresh !== undefined ? { refresh } : {}),
    ...(unfocusedRefresh !== undefined ? { unfocusedRefresh } : {}),
  }
}

const mergeGamescopeScale = (
  base: NonNullable<GamescopePolicy["display"]>["scale"],
  extra: NonNullable<GamescopePolicy["display"]>["scale"],
): NonNullable<GamescopePolicy["display"]>["scale"] => {
  if (extra === undefined) return base
  const max = lastDefined(base?.max, extra.max)
  return { ...(max !== undefined ? { max } : {}) }
}

const mergeGamescopeDisplay = (
  base: GamescopePolicy["display"],
  extra: GamescopePolicy["display"],
): GamescopePolicy["display"] => {
  if (extra === undefined) return base
  const output = mergeGamescopeOutput(base?.output, extra.output)
  const nested = mergeGamescopeNested(base?.nested, extra.nested)
  const scale = mergeGamescopeScale(base?.scale, extra.scale)
  const orientation = lastDefined(base?.orientation, extra.orientation)
  const adaptiveSync = lastDefined(base?.adaptiveSync, extra.adaptiveSync)
  const framerateLimit = lastDefined(base?.framerateLimit, extra.framerateLimit)
  return {
    ...(output !== undefined ? { output } : {}),
    ...(nested !== undefined ? { nested } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(orientation !== undefined ? { orientation } : {}),
    ...(adaptiveSync !== undefined ? { adaptiveSync } : {}),
    ...(framerateLimit !== undefined ? { framerateLimit } : {}),
  }
}

const mergeGamescopeScaling = (
  base: GamescopePolicy["scaling"],
  extra: GamescopePolicy["scaling"],
): GamescopePolicy["scaling"] => {
  if (extra === undefined) return base
  const scaler = lastDefined(base?.scaler, extra.scaler)
  const filter = lastDefined(base?.filter, extra.filter)
  const sharpness = lastDefined(base?.sharpness, extra.sharpness)
  return {
    ...(scaler !== undefined ? { scaler } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(sharpness !== undefined ? { sharpness } : {}),
  }
}

const mergeGamescopeCursor = (
  base: GamescopePolicy["cursor"],
  extra: GamescopePolicy["cursor"],
): GamescopePolicy["cursor"] => {
  if (extra === undefined) return base
  const image = lastDefined(base?.image, extra.image)
  const hotspot = lastDefined(base?.hotspot, extra.hotspot)
  const hideDelay = lastDefined(base?.hideDelay, extra.hideDelay)
  const scaleHeight = lastDefined(base?.scaleHeight, extra.scaleHeight)
  return {
    ...(image !== undefined ? { image } : {}),
    ...(hotspot !== undefined ? { hotspot } : {}),
    ...(hideDelay !== undefined ? { hideDelay } : {}),
    ...(scaleHeight !== undefined ? { scaleHeight } : {}),
  }
}

const mergeGamescopeInput = (
  base: GamescopePolicy["input"],
  extra: GamescopePolicy["input"],
): GamescopePolicy["input"] => {
  if (extra === undefined) return base
  const mouseSensitivity = lastDefined(
    base?.mouseSensitivity,
    extra.mouseSensitivity,
  )
  const defaultTouchMode = lastDefined(
    base?.defaultTouchMode,
    extra.defaultTouchMode,
  )
  return {
    ...(mouseSensitivity !== undefined ? { mouseSensitivity } : {}),
    ...(defaultTouchMode !== undefined ? { defaultTouchMode } : {}),
  }
}

const mergeGamescopeScheduling = (
  base: GamescopePolicy["scheduling"],
  extra: GamescopePolicy["scheduling"],
): GamescopePolicy["scheduling"] => {
  if (extra === undefined) return base
  const realtime = lastDefined(base?.realtime, extra.realtime)
  const readyFd = lastDefined(base?.readyFd, extra.readyFd)
  const keepAlive = lastDefined(base?.keepAlive, extra.keepAlive)
  return {
    ...(realtime !== undefined ? { realtime } : {}),
    ...(readyFd !== undefined ? { readyFd } : {}),
    ...(keepAlive !== undefined ? { keepAlive } : {}),
  }
}

const mergeGamescopeStats = (
  base: GamescopePolicy["stats"],
  extra: GamescopePolicy["stats"],
): GamescopePolicy["stats"] => {
  if (extra === undefined) return base
  const path = lastDefined(base?.path, extra.path)
  return { ...(path !== undefined ? { path } : {}) }
}

const mergeGamescopeSteam = (
  base: GamescopePolicy["steam"],
  extra: GamescopePolicy["steam"],
): GamescopePolicy["steam"] => {
  if (extra === undefined) return base
  const enableIntegration = lastDefined(
    base?.enableIntegration,
    extra.enableIntegration,
  )
  const mangoapp = lastDefined(base?.mangoapp, extra.mangoapp)
  return {
    ...(enableIntegration !== undefined ? { enableIntegration } : {}),
    ...(mangoapp !== undefined ? { mangoapp } : {}),
  }
}

const mergeGamescopeEmbedded = (
  base: GamescopePolicy["embedded"],
  extra: GamescopePolicy["embedded"],
): GamescopePolicy["embedded"] => {
  if (extra === undefined) return base
  const generateDrmMode = lastDefined(
    base?.generateDrmMode,
    extra.generateDrmMode,
  )
  const immediateFlips = lastDefined(base?.immediateFlips, extra.immediateFlips)
  const virtualConnectorStrategy = lastDefined(
    base?.virtualConnectorStrategy,
    extra.virtualConnectorStrategy,
  )
  return {
    ...(generateDrmMode !== undefined ? { generateDrmMode } : {}),
    ...(immediateFlips !== undefined ? { immediateFlips } : {}),
    ...(virtualConnectorStrategy !== undefined
      ? { virtualConnectorStrategy }
      : {}),
  }
}

const mergeGamescopeHdrInverseToneMapping = (
  base: NonNullable<GamescopePolicy["hdr"]>["inverseToneMapping"],
  extra: NonNullable<GamescopePolicy["hdr"]>["inverseToneMapping"],
): NonNullable<GamescopePolicy["hdr"]>["inverseToneMapping"] => {
  if (extra === undefined) return base
  const enable = lastDefined(base?.enable, extra.enable)
  const sdrNits = lastDefined(base?.sdrNits, extra.sdrNits)
  const targetNits = lastDefined(base?.targetNits, extra.targetNits)
  return {
    ...(enable !== undefined ? { enable } : {}),
    ...(sdrNits !== undefined ? { sdrNits } : {}),
    ...(targetNits !== undefined ? { targetNits } : {}),
  }
}

const mergeGamescopeHdrDebug = (
  base: NonNullable<GamescopePolicy["hdr"]>["debug"],
  extra: NonNullable<GamescopePolicy["hdr"]>["debug"],
): NonNullable<GamescopePolicy["hdr"]>["debug"] => {
  if (extra === undefined) return base
  const forceSupport = lastDefined(base?.forceSupport, extra.forceSupport)
  const forceOutput = lastDefined(base?.forceOutput, extra.forceOutput)
  const heatmap = lastDefined(base?.heatmap, extra.heatmap)
  return {
    ...(forceSupport !== undefined ? { forceSupport } : {}),
    ...(forceOutput !== undefined ? { forceOutput } : {}),
    ...(heatmap !== undefined ? { heatmap } : {}),
  }
}

const mergeGamescopeHdr = (
  base: GamescopePolicy["hdr"],
  extra: GamescopePolicy["hdr"],
): GamescopePolicy["hdr"] => {
  if (extra === undefined) return base
  const enable = lastDefined(base?.enable, extra.enable)
  const sdrGamutWideness = lastDefined(
    base?.sdrGamutWideness,
    extra.sdrGamutWideness,
  )
  const sdrContentNits = lastDefined(base?.sdrContentNits, extra.sdrContentNits)
  const inverseToneMapping = mergeGamescopeHdrInverseToneMapping(
    base?.inverseToneMapping,
    extra.inverseToneMapping,
  )
  const debug = mergeGamescopeHdrDebug(base?.debug, extra.debug)
  return {
    ...(enable !== undefined ? { enable } : {}),
    ...(sdrGamutWideness !== undefined ? { sdrGamutWideness } : {}),
    ...(sdrContentNits !== undefined ? { sdrContentNits } : {}),
    ...(inverseToneMapping !== undefined ? { inverseToneMapping } : {}),
    ...(debug !== undefined ? { debug } : {}),
  }
}

const mergeGamescopeVrControlBar = (
  base: NonNullable<GamescopePolicy["vr"]>["controlBar"],
  extra: NonNullable<GamescopePolicy["vr"]>["controlBar"],
): NonNullable<GamescopePolicy["vr"]>["controlBar"] => {
  if (extra === undefined) return base
  const enable = lastDefined(base?.enable, extra.enable)
  const keyboard = lastDefined(base?.keyboard, extra.keyboard)
  const close = lastDefined(base?.close, extra.close)
  return {
    ...(enable !== undefined ? { enable } : {}),
    ...(keyboard !== undefined ? { keyboard } : {}),
    ...(close !== undefined ? { close } : {}),
  }
}

const mergeGamescopeVr = (
  base: GamescopePolicy["vr"],
  extra: GamescopePolicy["vr"],
): GamescopePolicy["vr"] => {
  if (extra === undefined) return base
  const overlayKey = lastDefined(base?.overlayKey, extra.overlayKey)
  const appOverlayKey = lastDefined(base?.appOverlayKey, extra.appOverlayKey)
  const explicitName = lastDefined(base?.explicitName, extra.explicitName)
  const defaultName = lastDefined(base?.defaultName, extra.defaultName)
  const icon = lastDefined(base?.icon, extra.icon)
  const showImmediately = lastDefined(
    base?.showImmediately,
    extra.showImmediately,
  )
  const modal = lastDefined(base?.modal, extra.modal)
  const physicalWidth = lastDefined(base?.physicalWidth, extra.physicalWidth)
  const physicalCurvature = lastDefined(
    base?.physicalCurvature,
    extra.physicalCurvature,
  )
  const physicalPreCurvePitch = lastDefined(
    base?.physicalPreCurvePitch,
    extra.physicalPreCurvePitch,
  )
  const scrollSpeed = lastDefined(base?.scrollSpeed, extra.scrollSpeed)
  const sessionManager = lastDefined(base?.sessionManager, extra.sessionManager)
  const controlBar = mergeGamescopeVrControlBar(
    base?.controlBar,
    extra.controlBar,
  )
  const clickStabilization = lastDefined(
    base?.clickStabilization,
    extra.clickStabilization,
  )
  return {
    ...(overlayKey !== undefined ? { overlayKey } : {}),
    ...(appOverlayKey !== undefined ? { appOverlayKey } : {}),
    ...(explicitName !== undefined ? { explicitName } : {}),
    ...(defaultName !== undefined ? { defaultName } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(showImmediately !== undefined ? { showImmediately } : {}),
    ...(modal !== undefined ? { modal } : {}),
    ...(physicalWidth !== undefined ? { physicalWidth } : {}),
    ...(physicalCurvature !== undefined ? { physicalCurvature } : {}),
    ...(physicalPreCurvePitch !== undefined ? { physicalPreCurvePitch } : {}),
    ...(scrollSpeed !== undefined ? { scrollSpeed } : {}),
    ...(sessionManager !== undefined ? { sessionManager } : {}),
    ...(controlBar !== undefined ? { controlBar } : {}),
    ...(clickStabilization !== undefined ? { clickStabilization } : {}),
  }
}

const mergeGamescopeReshade = (
  base: GamescopePolicy["reshade"],
  extra: GamescopePolicy["reshade"],
): GamescopePolicy["reshade"] => {
  if (extra === undefined) return base
  const effect = lastDefined(base?.effect, extra.effect)
  const techniqueIndex = lastDefined(base?.techniqueIndex, extra.techniqueIndex)
  return {
    ...(effect !== undefined ? { effect } : {}),
    ...(techniqueIndex !== undefined ? { techniqueIndex } : {}),
  }
}

const mergeGamescopeSteamDeck = (
  base: GamescopePolicy["steamDeck"],
  extra: GamescopePolicy["steamDeck"],
): GamescopePolicy["steamDeck"] => {
  if (extra === undefined) return base
  const muraMap = lastDefined(base?.muraMap, extra.muraMap)
  return { ...(muraMap !== undefined ? { muraMap } : {}) }
}

const mergeGamescopeDebug = (
  base: GamescopePolicy["debug"],
  extra: GamescopePolicy["debug"],
): GamescopePolicy["debug"] => {
  if (extra === undefined) return base
  const disableLayers = lastDefined(base?.disableLayers, extra.disableLayers)
  const layers = lastDefined(base?.layers, extra.layers)
  const focus = lastDefined(base?.focus, extra.focus)
  const synchronousX11 = lastDefined(base?.synchronousX11, extra.synchronousX11)
  const hud = lastDefined(base?.hud, extra.hud)
  const events = lastDefined(base?.events, extra.events)
  const forceComposition = lastDefined(
    base?.forceComposition,
    extra.forceComposition,
  )
  const compositeMarkers = lastDefined(
    base?.compositeMarkers,
    extra.compositeMarkers,
  )
  const disableColorManagement = lastDefined(
    base?.disableColorManagement,
    extra.disableColorManagement,
  )
  const disableXres = lastDefined(base?.disableXres, extra.disableXres)
  return {
    ...(disableLayers !== undefined ? { disableLayers } : {}),
    ...(layers !== undefined ? { layers } : {}),
    ...(focus !== undefined ? { focus } : {}),
    ...(synchronousX11 !== undefined ? { synchronousX11 } : {}),
    ...(hud !== undefined ? { hud } : {}),
    ...(events !== undefined ? { events } : {}),
    ...(forceComposition !== undefined ? { forceComposition } : {}),
    ...(compositeMarkers !== undefined ? { compositeMarkers } : {}),
    ...(disableColorManagement !== undefined ? { disableColorManagement } : {}),
    ...(disableXres !== undefined ? { disableXres } : {}),
  }
}

const mergeGamescopeApp = (
  base: GamescopePolicy["app"],
  extra: GamescopePolicy["app"],
): GamescopePolicy["app"] => {
  if (extra === undefined) return base
  const environment = mergeEnvironmentOverlay(
    base?.environment,
    extra.environment,
  )
  return { ...(environment !== undefined ? { environment } : {}) }
}

/** Deep-merge two gamescope policies; `extraArgs` concat, scalars last-win. */
const foldGamescope = (
  base: GamescopePolicy | undefined,
  extra: GamescopePolicy,
): GamescopePolicy => {
  const enable = lastDefined(base?.enable, extra.enable)
  const command = lastDefined(base?.command, extra.command)
  const environment = mergeEnvironmentOverlay(
    base?.environment,
    extra.environment,
  )
  const app = mergeGamescopeApp(base?.app, extra.app)
  const backend = mergeGamescopeBackend(base?.backend, extra.backend)
  const window = mergeGamescopeWindow(base?.window, extra.window)
  const display = mergeGamescopeDisplay(base?.display, extra.display)
  const scaling = mergeGamescopeScaling(base?.scaling, extra.scaling)
  const cursor = mergeGamescopeCursor(base?.cursor, extra.cursor)
  const input = mergeGamescopeInput(base?.input, extra.input)
  const scheduling = mergeGamescopeScheduling(
    base?.scheduling,
    extra.scheduling,
  )
  const stats = mergeGamescopeStats(base?.stats, extra.stats)
  const steam = mergeGamescopeSteam(base?.steam, extra.steam)
  const embedded = mergeGamescopeEmbedded(base?.embedded, extra.embedded)
  const hdr = mergeGamescopeHdr(base?.hdr, extra.hdr)
  const vr = mergeGamescopeVr(base?.vr, extra.vr)
  const reshade = mergeGamescopeReshade(base?.reshade, extra.reshade)
  const steamDeck = mergeGamescopeSteamDeck(base?.steamDeck, extra.steamDeck)
  const debug = mergeGamescopeDebug(base?.debug, extra.debug)
  const extraArgs =
    extra.extraArgs !== undefined
      ? [...(base?.extraArgs ?? []), ...extra.extraArgs]
      : base?.extraArgs

  return {
    ...(enable !== undefined ? { enable } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(environment !== undefined ? { environment } : {}),
    ...(app !== undefined ? { app } : {}),
    ...(backend !== undefined ? { backend } : {}),
    ...(window !== undefined ? { window } : {}),
    ...(display !== undefined ? { display } : {}),
    ...(scaling !== undefined ? { scaling } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(scheduling !== undefined ? { scheduling } : {}),
    ...(stats !== undefined ? { stats } : {}),
    ...(steam !== undefined ? { steam } : {}),
    ...(embedded !== undefined ? { embedded } : {}),
    ...(hdr !== undefined ? { hdr } : {}),
    ...(vr !== undefined ? { vr } : {}),
    ...(reshade !== undefined ? { reshade } : {}),
    ...(steamDeck !== undefined ? { steamDeck } : {}),
    ...(debug !== undefined ? { debug } : {}),
    ...(extraArgs !== undefined ? { extraArgs } : {}),
  }
}

const isPlainPolicyObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergeRetroArchValue = (
  base: unknown,
  extra: unknown,
  path: readonly string[],
): unknown => {
  if (extra === undefined) return base
  const key = path.join(".")
  if (key === "extraArgs" || key === "configFile.append") {
    return Array.isArray(extra)
      ? [...(Array.isArray(base) ? base : []), ...extra]
      : extra
  }
  if (key === "environment" || key === "extraSettings") {
    return isPlainPolicyObject(extra)
      ? { ...(isPlainPolicyObject(base) ? base : {}), ...extra }
      : extra
  }
  if (isPlainPolicyObject(base) && isPlainPolicyObject(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [childKey, childValue] of Object.entries(extra)) {
      merged[childKey] = mergeRetroArchValue(merged[childKey], childValue, [
        ...path,
        childKey,
      ])
    }
    return merged
  }
  return extra
}

/** Deep-merge two RetroArch policies; extraArgs/configFile.append concat. */
export const foldRetroArch = (
  base: RetroArchPolicy | undefined,
  extra: RetroArchPolicy,
): RetroArchPolicy =>
  mergeRetroArchValue(base ?? {}, extra, []) as RetroArchPolicy

const mergeRyubingValue = (
  base: unknown,
  extra: unknown,
  path: readonly string[],
): unknown => {
  if (extra === undefined) return base
  const key = path.join(".")
  if (key === "extra.args") {
    return Array.isArray(extra)
      ? [...(Array.isArray(base) ? base : []), ...extra]
      : extra
  }
  if (key === "env") {
    return isPlainPolicyObject(extra)
      ? { ...(isPlainPolicyObject(base) ? base : {}), ...extra }
      : extra
  }
  if (isPlainPolicyObject(base) && isPlainPolicyObject(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [childKey, childValue] of Object.entries(extra)) {
      merged[childKey] = mergeRyubingValue(merged[childKey], childValue, [
        ...path,
        childKey,
      ])
    }
    return merged
  }
  return extra
}

/** Deep-merge two Ryubing policies; env/extra.config maps merge and extra.args concat. */
export const foldRyubing = (
  base: RyubingPolicy | undefined,
  extra: RyubingPolicy,
): RyubingPolicy => mergeRyubingValue(base ?? {}, extra, []) as RyubingPolicy

const mergeSteamValue = (
  base: unknown,
  extra: unknown,
  path: readonly string[],
): unknown => {
  if (extra === undefined) return base
  const key = path.join(".")
  if (key === "extra.args") {
    return Array.isArray(extra)
      ? [...(Array.isArray(base) ? base : []), ...extra]
      : extra
  }
  if (isPlainPolicyObject(base) && isPlainPolicyObject(extra)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [childKey, childValue] of Object.entries(extra)) {
      merged[childKey] = mergeSteamValue(merged[childKey], childValue, [
        ...path,
        childKey,
      ])
    }
    return merged
  }
  return extra
}

export const foldSteam = (
  base: SteamPolicy | undefined,
  extra: SteamPolicy,
): SteamPolicy => mergeSteamValue(base ?? {}, extra, []) as SteamPolicy

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
    gamescope: normalizeGamescopePolicy(folded.gamescope),
    ...(folded.moonlight ? { moonlight: folded.moonlight } : {}),
  }
}

export const resolveLocalLauncherGamescopePolicy = (
  snap: ConfigSnapshot,
  inputs: ResolveLocalLauncherGamescopePolicyInputs,
): GamescopePolicy => resolveLocalLauncherPolicy(snap, inputs).gamescope

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

export class AmbiguousAppChoice extends Data.TaggedError("AmbiguousAppChoice")<{
  readonly playableId: string
  readonly releaseId: string
  readonly appIds: readonly string[]
}> {}

export class AppChoiceNotFound extends Data.TaggedError("AppChoiceNotFound")<{
  readonly playableId: string
  readonly releaseId: string
  readonly appId: string
  readonly appIds: readonly string[]
}> {}

export class InvalidAppChoiceForKind extends Data.TaggedError(
  "InvalidAppChoiceForKind",
)<{
  readonly appId: string
  readonly kind: string
  readonly field: string
}> {}

export class MultiTargetUnsupported extends Data.TaggedError(
  "MultiTargetUnsupported",
)<{
  readonly playableId: string
  readonly releaseId: string
}> {}

interface ReadableOverride {
  readonly gamescope?: GamescopePolicy
  readonly moonlight?: MoonlightPolicy
  readonly retroarch?: RetroArchPolicy
  readonly ryubing?: RyubingPolicy
  readonly steam?: SteamPolicy
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
  readonly gamescope?: GamescopePolicy
  readonly moonlight?: MoonlightPolicy
  readonly retroarch?: RetroArchPolicy
  readonly ryubing?: RyubingPolicy
  readonly steam?: SteamPolicy
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly argsAppend?: readonly string[]
  readonly patches?: readonly string[]
}

const readableViewOfUser = (user: UserRecord | undefined): ReadableLayerView =>
  user
    ? {
        gamescope: user.gamescope,
        moonlight: user.moonlight,
        retroarch: user.retroarch,
        ryubing: user.ryubing,
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
        gamescope: system.gamescope,
        moonlight: system.moonlight,
        retroarch: system.retroarch,
        ryubing: system.ryubing,
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
        gamescope: source.gamescope,
        moonlight: source.moonlight,
        retroarch: source.retroarch,
        ryubing: source.ryubing,
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
        moonlight: app.moonlight,
        retroarch: appRetroArchPolicyFromRecord(app),
        ryubing: appRyubingPolicyFromRecord(app),
        steam: appSteamPolicyFromRecord(app),
        env: app.env,
        cwd: app.cwd,
        argsAppend: app.argsAppend,
        patches: app.patches,
      }
    : {}

const readableViewOfAppChoice = (
  choice: ReadableLayerView & {
    readonly "launch-options"?: string
    readonly extra?: SteamPolicy["extra"]
  },
  app: AppRecord,
): ReadableLayerView => ({
  gamescope: choice.gamescope,
  moonlight: choice.moonlight,
  retroarch: choice.retroarch,
  steam:
    appRecordKind(app) === "steam"
      ? {
          ...(choice.extra !== undefined ? { extra: choice.extra } : {}),
          ...(choice["launch-options"] !== undefined
            ? { "launch-options": choice["launch-options"] }
            : {}),
        }
      : undefined,
  env: choice.env,
  cwd: choice.cwd,
  argsAppend: choice.argsAppend,
  patches: choice.patches,
})

const readableBuiltInArgs = (
  appId: string,
  legacyArgs: readonly string[],
): readonly string[] => {
  if (appId === "retroarch") return []
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
  if (builtIn.id === "steam" && override === undefined) return undefined
  return {
    id: appId,
    kind: override?.kind ?? builtIn.kind,
    command: override?.command ?? builtIn.command,
    runtime: override?.runtime,
    args: override?.args ?? readableBuiltInArgs(appId, builtIn.args),
    systems: override?.systems ?? builtIn.systems,
    policy: override?.policy ?? builtIn.policy,
    settings: override?.settings ?? builtIn.settings,
    gamescope: mergeBuiltInAppGamescopePolicy(
      builtIn.gamescope,
      override?.gamescope,
    ),
    moonlight: override?.moonlight ?? builtIn.moonlight,
    ...(override?.kind === "retroarch" || builtIn.kind === "retroarch"
      ? override !== undefined
        ? (appRetroArchPolicyFromRecord(override) ?? builtIn.retroarch)
        : builtIn.retroarch
      : {}),
    ...(override?.kind === "steam" || builtIn.kind === "steam"
      ? {
          state: override?.state,
          extra: override?.extra,
          "launch-options": override?.["launch-options"],
        }
      : {}),
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
        moonlight: runtime.moonlight,
        retroarch: runtime.retroarch,
        ryubing: runtime.ryubing,
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
  moonlight: item.moonlight,
  retroarch: item.retroarch,
  ryubing: item.ryubing,
  env: item.env,
  cwd: item.cwd,
  argsAppend: item.argsAppend,
  patches: item.patches,
})

const readableViewOfContained = (entry: PlayableEntry): ReadableLayerView => ({
  gamescope: entry.contained?.gamescope,
  moonlight: entry.contained?.moonlight,
  retroarch: entry.contained?.retroarch,
  ryubing: entry.contained?.ryubing,
  env: entry.contained?.env,
  cwd: entry.contained?.cwd,
  argsAppend: entry.contained?.argsAppend,
  patches: entry.contained?.patches,
})

const readableViewOfRelease = (
  release: LibraryReleasePayload,
): ReadableLayerView => ({
  gamescope: release.gamescope,
  moonlight: release.moonlight,
  retroarch: release.retroarch,
  ryubing: release.ryubing,
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
        gamescope: profile.gamescope,
        moonlight: profile.moonlight,
        retroarch: profile.retroarch,
        ryubing: profile.ryubing,
        env: profile.env,
        cwd: profile.cwd,
        argsAppend: profile.argsAppend,
        patches: profile.patches,
      }
    : {}

const mergeReadableLayers = (
  layers: readonly ReadableLayerView[],
): ReadableLayerView => {
  let gamescope: GamescopePolicy | undefined
  let moonlight: MoonlightPolicy | undefined
  let retroarch: RetroArchPolicy | undefined
  let ryubing: RyubingPolicy | undefined
  let steam: SteamPolicy | undefined
  let env: Record<string, string> | undefined
  let cwd: string | undefined
  let argsAppend: string[] | undefined
  let patches: string[] | undefined

  for (const layer of layers) {
    if (layer.gamescope !== undefined) {
      gamescope = foldGamescope(gamescope, layer.gamescope)
    }
    if (layer.moonlight !== undefined) {
      moonlight = foldMoonlight(moonlight, layer.moonlight)
    }
    if (layer.retroarch !== undefined) {
      retroarch = foldRetroArch(retroarch, layer.retroarch)
    }
    if (layer.ryubing !== undefined) {
      ryubing = foldRyubing(ryubing, layer.ryubing)
    }
    if (layer.steam !== undefined) {
      steam = foldSteam(steam, layer.steam)
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

  return {
    gamescope,
    moonlight,
    retroarch,
    ryubing,
    steam,
    env,
    cwd,
    argsAppend,
    patches,
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
  const app = resolveReadableAppRecord(inputs.launcherId, snapshot.apps)
  const folded = mergeReadableLayers([
    snapshot.host ?? {},
    readableViewOfApp(app),
    inputs.override ?? {},
  ])
  return {
    gamescope: normalizeGamescopePolicy(folded.gamescope),
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
    const appChoiceSelection = selectAppChoice(
      resolveEffectiveAppChoices(system?.apps, release.apps),
      inputs.appId,
    )
    const selectedChoice =
      appChoiceSelection._tag === "SelectedAppChoice"
        ? appChoiceSelection.choice
        : undefined
    if (appChoiceSelection._tag === "AmbiguousAppChoice") {
      return yield* Effect.fail(
        new AmbiguousAppChoice({
          playableId: inputs.playableId,
          releaseId: release.id,
          appIds: appChoiceSelection.appIds,
        }),
      )
    }
    if (appChoiceSelection._tag === "AppChoiceNotFound") {
      return yield* Effect.fail(
        new AppChoiceNotFound({
          playableId: inputs.playableId,
          releaseId: release.id,
          appId: appChoiceSelection.appId,
          appIds: appChoiceSelection.appIds,
        }),
      )
    }

    const appId = selectedChoice?.id
    if (appId === undefined) {
      return yield* Effect.fail(
        new ReleaseNotLaunchable({ releaseId: release.id }),
      )
    }
    const app = resolveReadableAppRecord(appId, snapshot.apps)
    if (app === undefined) return yield* Effect.fail(new AppNotFound({ appId }))
    const appKind = appRecordKind(app)
    if (appKind !== "steam") {
      const invalidField =
        selectedChoice?.["launch-options"] !== undefined
          ? "launch-options"
          : selectedChoice?.extra !== undefined
            ? "extra"
            : undefined
      if (invalidField !== undefined) {
        return yield* Effect.fail(
          new InvalidAppChoiceForKind({
            appId,
            kind: appKind,
            field: invalidField,
          }),
        )
      }
    }

    const runtimeId = selectedChoice?.runtime ?? app.runtime
    const runtime =
      runtimeId === undefined ? undefined : snapshot.runtimes.get(runtimeId)
    if (runtimeId !== undefined && runtime === undefined) {
      return yield* Effect.fail(new RuntimeNotFound({ runtimeId }))
    }

    const folded = mergeReadableLayers([
      snapshot.host ?? {},
      readableViewOfUser(user),
      readableViewOfSystem(system),
      readableViewOfSource(source),
      readableViewOfApp(app),
      selectedChoice ? readableViewOfAppChoice(selectedChoice, app) : {},
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
      ...(folded.moonlight ? { moonlight: folded.moonlight } : {}),
      ...(folded.retroarch ? { retroarch: folded.retroarch } : {}),
      ...(folded.ryubing ? { ryubing: folded.ryubing } : {}),
      ...(folded.steam ? { steam: folded.steam } : {}),
      storage: Object.fromEntries(snapshot.storage),
      ...(folded.env ? { env: folded.env } : {}),
      ...(folded.cwd !== undefined ? { cwd: folded.cwd } : {}),
      ...(folded.argsAppend ? { argsAppend: folded.argsAppend } : {}),
      ...(folded.patches ? { patches: folded.patches } : {}),
    }
  })
