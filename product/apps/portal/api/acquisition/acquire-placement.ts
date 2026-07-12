/**
 * Default placement + import runner for acquire jobs.
 *
 * Copies a staged artifact into the preferred configured storage
 * (`roms` unless overridden) and runs the same configured Scout scan the
 * boot-time unit uses, so the placed file materializes as a launchable
 * library release and korrid's config watchers broadcast the change.
 */
import {
  type ConfiguredStorageRoot,
  type PlacedArtifact,
  placeAcquiredArtifact,
} from "@platform/acquisition/artifact-placement"
import {
  readConfiguredStorageRoots,
  scanConfiguredReleaseCandidates,
} from "@platform/library/discovery/release-candidate-scan"
import type { ReleaseDiscoveryProvider } from "@platform/plugin/discovery"
import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
} from "@platform/protocol/acquisition/artifact-acquisition"
import type { AcquirePlacementRunner } from "./acquire-jobs"

export interface AcquirePlacementOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly discoveryProviders?: readonly ReleaseDiscoveryProvider[]
  /** Test seams. */
  readonly readStorages?: () => Promise<readonly ConfiguredStorageRoot[]>
  readonly runScan?: (configPath: string) => Promise<void>
}

export function createAcquirePlacementRunner(
  options: AcquirePlacementOptions = {},
): AcquirePlacementRunner {
  const env = options.env ?? process.env

  const readStorages =
    options.readStorages ?? (() => readConfiguredStorageRoots({ env }))

  const runScan =
    options.runScan ??
    (async (configPath: string) => {
      const result = await scanConfiguredReleaseCandidates({
        configPath,
        env,
        findBinary: optionalEnv(env, "KORRI_FIND_BIN"),
        discoveryProviders: options.discoveryProviders,
        // Interactive Get must not hash the whole existing library: identity
        // backfill sha256s every identity-less claimed release (multi-GB
        // images included), which stalls imports for tens of minutes.
        identityPolicy: "skip",
      })
      if (result.status !== "ok") {
        const detail =
          "message" in result && typeof result.message === "string"
            ? result.message
            : "reason" in result
              ? String(result.reason)
              : "unknown"
        throw new Error(`configured scan ${result.status}: ${detail}`)
      }
    })

  return {
    async placeAndImport(
      artifact: AcquiredArtifact,
      request: AcquireArtifactRequest,
    ): Promise<PlacedArtifact> {
      const storages = await readStorages()
      const placed = await placeAcquiredArtifact({
        artifact,
        storages,
        ...(optionalEnv(env, "KORRI_ACQUISITION_LIBRARY_STORAGE")
          ? {
              preferredStorageId: optionalEnv(
                env,
                "KORRI_ACQUISITION_LIBRARY_STORAGE",
              ),
            }
          : {}),
        ...(request.system ? { system: request.system } : {}),
      })
      await runScan(scoutMergeConfigPath(env))
      return placed
    },
  }
}

/**
 * Mutable config file that receives Scout merges: explicit override, else
 * `<first writable config root>/korri.yaml` (matching the boot-scan default
 * of `services.korri.config.localRoot`).
 */
export function scoutMergeConfigPath(env: NodeJS.ProcessEnv): string {
  const explicit = optionalEnv(env, "KORRI_SCOUT_CONFIG_PATH")
  if (explicit) return explicit
  const roots = optionalEnv(env, "KORRI_CONFIG_ROOTS")?.split(":") ?? []
  const writable = roots.find(
    root => root.length > 0 && !root.startsWith("/nix/store/"),
  )
  if (!writable) {
    throw new Error(
      "no writable config root for Scout merge (set KORRI_SCOUT_CONFIG_PATH or KORRI_CONFIG_ROOTS)",
    )
  }
  return `${writable.replace(/\/$/, "")}/korri.yaml`
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]
  return value && value.length > 0 ? value : undefined
}
