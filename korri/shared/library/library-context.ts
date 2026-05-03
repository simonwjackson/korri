/**
 * Server-side library composition — the single place RPC handlers reach to
 * get the active `LibrarySource` + `Launcher` pair.
 *
 * Construction is lazy and module-scoped: the first call to
 * `getLibraryContext()` reads env vars, builds the configured pair, and
 * caches them. Production reads `/storage/.config/emulationstation/...` and
 * spawns `runemu.sh`; tests call `configureLibraryContextForTesting(...)`
 * with **configured-real** instances (a `RocknixSource` over a
 * `withTempLibrary` directory + a `ShellLauncher` aimed at `fake-game.sh`)
 * and never reach env-driven construction.
 *
 * The function name is intentionally `configureLibraryContextForTesting`
 * (not `setLibraryContextForTesting`) — see
 * docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 5).
 */

import { logger } from "@shared/logger/logger"

import type { Launcher } from "./launcher"
import type { LibrarySource } from "./library-source"
import {
  createRocknixSource,
  defaultRocknixConfig,
  type RocknixConfig,
} from "./rocknix/rocknix-source"
import { createShellLauncher } from "./shell-launcher"

export type LibraryContext = {
  readonly source: LibrarySource
  readonly launcher: Launcher
}

let cached: LibraryContext | null = null
let testOverride: LibraryContext | null = null

/**
 * Get (and lazily construct) the active library context. Test overrides
 * installed via `configureLibraryContextForTesting` take precedence.
 */
export function getLibraryContext(): LibraryContext {
  if (testOverride) return testOverride
  if (cached) return cached
  cached = buildFromEnv()
  return cached
}

/**
 * Install a configured-real pair for the duration of a test. Pair the call
 * with `resetLibraryContextForTesting()` in `afterEach` to restore env-driven
 * construction.
 */
export function configureLibraryContextForTesting(ctx: LibraryContext): void {
  testOverride = ctx
}

/**
 * Drop any test override. The next `getLibraryContext()` returns the cached
 * env-driven pair (or constructs one if no test ever ran).
 */
export function resetLibraryContextForTesting(): void {
  testOverride = null
}

/**
 * Force the cached env-driven pair to be reconstructed on the next
 * `getLibraryContext()` call. Useful in tests that rewrite env vars and want
 * the new values to take effect.
 */
export function clearLibraryContextCacheForTesting(): void {
  cached = null
}

function buildFromEnv(): LibraryContext {
  const sourceKind = pickSourceKind(process.env.KORRI_LIBRARY_SOURCE)
  const launcherKind = pickLauncherKind(process.env.KORRI_LAUNCHER)

  // Today "rocknix" is the only source kind and "shell" is the only launcher
  // kind; future products may add others. Unknown values are coerced back to
  // these defaults by `pickSourceKind` / `pickLauncherKind`.
  const source = createRocknixSource(buildRocknixConfigFromEnv())
  const launcher = createShellLauncher()

  logger.info({ sourceKind, launcherKind }, "library-context: built from env")
  return { source, launcher }
}

function pickSourceKind(raw: string | undefined): "rocknix" {
  if (!raw || raw === "rocknix") return "rocknix"
  logger.warn(
    { value: raw },
    "library-context: unknown KORRI_LIBRARY_SOURCE; falling back to rocknix",
  )
  return "rocknix"
}

function pickLauncherKind(raw: string | undefined): "shell" {
  if (!raw || raw === "shell") return "shell"
  logger.warn(
    { value: raw },
    "library-context: unknown KORRI_LAUNCHER; falling back to shell",
  )
  return "shell"
}

function buildRocknixConfigFromEnv(): RocknixConfig {
  const rootsRaw = process.env.KORRI_ROCKNIX_GAMELIST_ROOTS
  const esSystemsPathRaw = process.env.KORRI_ROCKNIX_ES_SYSTEMS
  const mediaRootRaw = process.env.KORRI_ROCKNIX_MEDIA_ROOT

  const defaults = defaultRocknixConfig()
  const gamelistRoots =
    rootsRaw && rootsRaw.trim() !== ""
      ? rootsRaw
          .split(":")
          .map(s => s.trim())
          .filter(s => s.length > 0)
      : defaults.gamelistRoots
  const esSystemsPath =
    esSystemsPathRaw && esSystemsPathRaw.trim() !== ""
      ? esSystemsPathRaw.trim()
      : defaults.esSystemsPath

  const mediaRoot =
    mediaRootRaw && mediaRootRaw.trim() !== ""
      ? mediaRootRaw.trim()
      : defaults.mediaRoot

  return { gamelistRoots, esSystemsPath, mediaRoot }
}
