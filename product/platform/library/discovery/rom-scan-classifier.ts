import { basename, extname, relative, sep } from "node:path"
import {
  decodeLibraryItemPayload,
  type LibraryItemPayload,
} from "@platform/library/config/records/library-item"

export type RomScanClassification =
  | RomScanCandidate
  | {
      readonly _tag: "Excluded"
      readonly path: string
      readonly reason: string
    }
  | {
      readonly _tag: "Unsupported"
      readonly path: string
      readonly system: string
      readonly reason: string
    }
  | {
      readonly _tag: "Unclaimed"
      readonly path: string
      readonly system: string
      readonly reason: string
    }
  | { readonly _tag: "Ignored"; readonly path: string; readonly reason: string }
  | {
      readonly _tag: "Ambiguous"
      readonly path: string
      readonly reason: string
    }

export interface RomScanCandidate {
  readonly _tag: "Candidate"
  readonly path: string
  readonly system: string
  readonly confidence: "high" | "medium" | "low"
  readonly app: string
  readonly runtime: string
  readonly releaseId?: string
  readonly title?: string
}

export interface RomScanOptions {
  readonly root?: string
}

export interface CreateRomLibraryCandidatesOptions {
  readonly storage: string
  readonly root?: string
  readonly reservedIds?: Set<string>
  readonly firstSeenAt: string
}

export interface RomLibraryCandidate {
  readonly id: string
  readonly title: string
  readonly classification: RomScanCandidate
  readonly record: LibraryItemPayload
}

const excludedPathSegments = new Set([
  "bios",
  "bezels",
  "images",
  "manuals",
  "media",
  "saves",
  "save",
  "screenshots",
  "themes",
])

const excludedExtensions = new Set([
  "dat",
  "jpg",
  "jpeg",
  "json",
  "mp4",
  "pdf",
  "png",
  "sav",
  "sh",
  "srm",
  "state",
  "txt",
  "xml",
])

const systemByExtension = new Map<string, string>([
  ["gba", "gba"],
  ["gb", "gb"],
  ["gbc", "gbc"],
  ["gcz", "wii"],
  ["iso", "disc-image"],
  ["nds", "nds"],
  ["nes", "nes"],
  ["nsp", "switch"],
  ["rvz", "wii"],
  ["sfc", "snes"],
  ["smc", "snes"],
  ["wad", "wii"],
  ["wbfs", "wii"],
  ["wua", "wiiu"],
  ["xci", "switch"],
  ["zip", "archive"],
])

export function classifyRomScanPath(
  path: string,
  options: RomScanOptions = {},
): RomScanClassification {
  const storagePath = storageRelativePath(path, options.root)
  const normalized = normalizePath(storagePath)
  const segments = normalized.toLowerCase().split("/").filter(Boolean)
  const extension = fileExtension(normalized)

  const excludedSegment = segments.find(segment =>
    excludedPathSegments.has(segment),
  )
  if (excludedSegment) {
    return {
      _tag: "Excluded",
      path: normalized,
      reason: `path:${excludedSegment}`,
    }
  }
  if (excludedExtensions.has(extension)) {
    return {
      _tag: "Excluded",
      path: normalized,
      reason: `extension:${extension}`,
    }
  }

  const folder = nearestSystemFolder(segments)
  const extensionSystem = systemByExtension.get(extension)
  if (
    folder !== undefined &&
    extensionSystem !== undefined &&
    extensionSystem !== "archive" &&
    extensionSystem !== "disc-image" &&
    folder !== extensionSystem
  ) {
    return {
      _tag: "Ambiguous",
      path: normalized,
      reason: `folder:${folder}/extension:${extensionSystem}`,
    }
  }

  if (extensionSystem === "disc-image" && folder === undefined) {
    return {
      _tag: "Ambiguous",
      path: normalized,
      reason: `extension:${extension}`,
    }
  }
  if (extensionSystem === "archive" && folder === undefined) {
    return {
      _tag: "Ambiguous",
      path: normalized,
      reason: `extension:${extension}`,
    }
  }

  if (extensionSystem === "gba") {
    return {
      _tag: "Unclaimed",
      path: normalized,
      system: "gba",
      reason: "unclaimed:gba",
    }
  }

  const unsupportedSystem = unsupportedSystemFor(folder, extension)
  if (unsupportedSystem) {
    return {
      _tag: "Unsupported",
      path: normalized,
      system: unsupportedSystem,
      reason: `unsupported:${unsupportedSystem}`,
    }
  }

  if (extension.length === 0) {
    return { _tag: "Ignored", path: normalized, reason: "extension:<none>" }
  }
  return { _tag: "Ignored", path: normalized, reason: `extension:${extension}` }
}

export function createRomLibraryCandidatesFromClassifications(
  classifications: readonly RomScanCandidate[],
  options: CreateRomLibraryCandidatesOptions,
): readonly RomLibraryCandidate[] {
  const usedIds = options.reservedIds ?? new Set<string>()
  const candidates: RomLibraryCandidate[] = []

  for (const classification of [...classifications].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const baseId = playableIdFromPath(classification.path)
    const id = uniqueId(baseId, usedIds)
    const title = classification.title ?? titleFromPath(classification.path)
    const record: LibraryItemPayload = {
      title,
      releases: [
        {
          id: classification.releaseId ?? classification.system,
          system: classification.system,
          target: {
            kind: "file",
            storage: options.storage,
            path: classification.path,
            discovery: { "first-seen-at": options.firstSeenAt },
          },
          launch: {
            use: classification.app,
            runtime: classification.runtime,
          },
        },
      ],
    }
    decodeLibraryItemPayload(record)
    candidates.push({ id, title, classification, record })
  }

  return candidates
}

function unsupportedSystemFor(
  folder: string | undefined,
  extension: string,
): string | undefined {
  if (extension === "nsp" || extension === "xci") return "switch"
  if (extension === "wua") return "wiiu"
  if (["gcz", "rvz", "wad", "wbfs"].includes(extension)) return "wii"
  if (folder === "wii" && extension === "iso") return "wii"
  if (folder === "nds" && extension === "zip") return "nds"
  if (folder === "gba" && extension === "zip") return "gba"
  if (extension === "nds") return "nds"
  const extensionSystem = systemByExtension.get(extension)
  if (extensionSystem === "archive" || extensionSystem === "disc-image") {
    return undefined
  }
  return extensionSystem
}

function nearestSystemFolder(segments: readonly string[]): string | undefined {
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment === "roms") break
    if (
      segment === "gb" ||
      segment === "gba" ||
      segment === "gbc" ||
      segment === "nds" ||
      segment === "nes" ||
      segment === "snes" ||
      segment === "switch" ||
      segment === "wii" ||
      segment === "wiiu"
    ) {
      return segment
    }
  }
  return undefined
}

function storageRelativePath(path: string, root: string | undefined): string {
  if (!root) return normalizePath(path)
  const relativePath = relative(root, path)
  if (isInsideRootRelativePath(relativePath)) {
    return normalizePath(relativePath)
  }
  return normalizePath(path)
}

function isInsideRootRelativePath(relativePath: string): boolean {
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !relativePath.startsWith("../")
  )
}

function normalizePath(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "")
}

function fileExtension(path: string): string {
  return extname(path).replace(/^\./, "").toLowerCase()
}

function playableIdFromPath(path: string): string {
  const withoutExtension = basename(path, extname(path))
  return slugify(withoutExtension) || "game"
}

function titleFromPath(path: string): string {
  const withoutExtension = basename(path, extname(path))
  const stripped = stripTitleDecorations(withoutExtension)
  return stripped
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripTitleDecorations(value: string): string {
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function uniqueId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }
  usedIds.add(candidate)
  return candidate
}
