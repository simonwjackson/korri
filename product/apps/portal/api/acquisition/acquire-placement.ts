/**
 * Default placement + import runner for acquire jobs.
 *
 * Copies a staged artifact into the preferred configured storage
 * (`roms` unless overridden) and runs the same configured Scout scan the
 * boot-time unit uses, so the placed file materializes as a launchable
 * library release and korrid's config watchers broadcast the change.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
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
import { parse, stringify } from "yaml"
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
      const configPath = scoutMergeConfigPath(env)
      await runScan(configPath)
      const title = placed.alreadyPresent ? undefined : request.title
      await applyImportMetadata({
        configPath,
        storageId: placed.storageId,
        relativePath: placed.relativePath,
        ...(title ? { title } : {}),
        // The staged artifact's digest was computed during acquisition, and
        // alreadyPresent placements are byte-identical by that same digest,
        // so the identity is correct for the placed file in both paths.
        sha256: artifact.digests.sha256,
      }).catch(() => {
        // Metadata is cosmetic; a failed patch must not fail the import.
      })
      return placed
    },
  }
}

interface PatchableRelease {
  identity?: { kind: string; value: string }
  readonly target?: {
    readonly storage?: string
    readonly path?: string
  }
}

interface PatchableEntry {
  title?: string
  releases?: PatchableRelease[]
}

/**
 * Post-import metadata patch. The Scout merge derives titles from file names
 * ("dank tomb 0") and, because interactive imports scan with
 * `identityPolicy: "skip"`, merges releases without content identity. But the
 * acquire pipeline already knows better on both counts: the claim carries the
 * real display title, and the staged artifact's sha256 was computed during
 * download verification. Finds the just-imported entry by its release target
 * (storage + path) and applies both — no file is ever re-read or re-hashed.
 *
 * Deliberately excludes art: persisted `metadata.media` is FORBIDDEN by the
 * readable schema ("persisted game metadata must not contain media entries")
 * and writing it rejects the entire config fragment, dropping every entry in
 * the file from the library. Claim art must flow through the game-assets
 * assignment system instead.
 */
export async function applyImportMetadata(options: {
  readonly configPath: string
  readonly storageId: string
  readonly relativePath: string
  readonly title?: string
  readonly sha256?: string
}): Promise<boolean> {
  const doc = parse(await readFile(options.configPath, "utf8")) as {
    library?: Record<string, PatchableEntry>
  } | null
  const library = doc?.library
  if (!doc || !library) return false

  let entry: PatchableEntry | undefined
  let release: PatchableRelease | undefined
  for (const item of Object.values(library)) {
    release = item?.releases?.find(
      candidate =>
        candidate?.target?.storage === options.storageId &&
        candidate?.target?.path === options.relativePath,
    )
    if (release) {
      entry = item
      break
    }
  }
  if (!entry || !release) return false

  let changed = false
  if (options.title && entry.title !== options.title) {
    entry.title = options.title
    changed = true
  }
  if (options.sha256 && release.identity === undefined) {
    release.identity = { kind: "hash", value: `sha256:${options.sha256}` }
    changed = true
  }
  if (!changed) return false

  const tempPath = join(
    dirname(options.configPath),
    `.claim-metadata.${process.pid}.${randomUUID()}.tmp`,
  )
  await mkdir(dirname(options.configPath), { recursive: true })
  try {
    await writeFile(tempPath, stringify(doc), { flag: "wx" })
    await rename(tempPath, options.configPath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
  return true
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
