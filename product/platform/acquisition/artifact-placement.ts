/**
 * Artifact placement — moves a staged acquisition into a configured library
 * storage so Scout discovery can import it as a launchable release.
 *
 * Placement is deliberately dumb: copy `<staging>/<sha>.<ext>` to
 * `<storage-root>/<system>/<fileName>` without overwriting existing files
 * (identical bytes are treated as already placed; different bytes get a
 * uniquified name). Which storage receives downloads is chosen by explicit
 * id preference, defaulting to `roms`, then the first configured storage
 * whose root exists.
 */
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, stat } from "node:fs/promises"
import { join, parse } from "node:path"
import type { AcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"

export interface ConfiguredStorageRoot {
  readonly id: string
  readonly root: string
}

export interface PlaceAcquiredArtifactOptions {
  readonly artifact: AcquiredArtifact
  readonly storages: readonly ConfiguredStorageRoot[]
  /** Storage id to prefer; defaults to "roms". */
  readonly preferredStorageId?: string
  /** Subdirectory under the storage root, usually the system id. */
  readonly system?: string
}

export interface PlacedArtifact {
  readonly storageId: string
  readonly storageRoot: string
  readonly relativePath: string
  readonly absolutePath: string
  readonly alreadyPresent: boolean
}

export class ArtifactPlacementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ArtifactPlacementError"
  }
}

export async function placeAcquiredArtifact(
  options: PlaceAcquiredArtifactOptions,
): Promise<PlacedArtifact> {
  const storage = await chooseStorage(options)
  const subdirectory = sanitizeSubdirectory(
    options.system ?? options.artifact.system ?? "downloads",
  )
  const directory = join(storage.root, subdirectory)
  await mkdir(directory, { recursive: true })

  const fileName = options.artifact.file.name
  const stagedSha256 = options.artifact.digests.sha256

  let candidate = fileName
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const absolutePath = join(directory, candidate)
    const existing = await fileSha256(absolutePath)
    if (existing === undefined) {
      await copyFile(options.artifact.stagedPath, absolutePath)
      return placed(storage, subdirectory, candidate, absolutePath, false)
    }
    if (existing === stagedSha256) {
      return placed(storage, subdirectory, candidate, absolutePath, true)
    }
    candidate = uniquifiedFileName(fileName, attempt + 1)
  }
  throw new ArtifactPlacementError(
    `could not find a free file name for ${fileName} in ${directory}`,
  )
}

function placed(
  storage: ConfiguredStorageRoot,
  subdirectory: string,
  fileName: string,
  absolutePath: string,
  alreadyPresent: boolean,
): PlacedArtifact {
  return {
    storageId: storage.id,
    storageRoot: storage.root,
    relativePath: `${subdirectory}/${fileName}`,
    absolutePath,
    alreadyPresent,
  }
}

async function chooseStorage(
  options: PlaceAcquiredArtifactOptions,
): Promise<ConfiguredStorageRoot> {
  const preferred = options.preferredStorageId ?? "roms"
  const candidates = [
    ...options.storages.filter(storage => storage.id === preferred),
    ...options.storages.filter(storage => storage.id !== preferred),
  ]
  for (const storage of candidates) {
    try {
      const info = await stat(storage.root)
      if (info.isDirectory()) return storage
    } catch {
      // Root not present (e.g. card removed); try the next storage.
    }
  }
  throw new ArtifactPlacementError(
    candidates.length === 0
      ? "no library storages are configured"
      : "no configured library storage root is currently available",
  )
}

function sanitizeSubdirectory(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
  return cleaned.length > 0 ? cleaned.slice(0, 64) : "downloads"
}

function uniquifiedFileName(fileName: string, attempt: number): string {
  const parsed = parse(fileName)
  return `${parsed.name} (${attempt})${parsed.ext}`
}

async function fileSha256(path: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(path)
    return createHash("sha256").update(bytes).digest("hex")
  } catch {
    return undefined
  }
}
