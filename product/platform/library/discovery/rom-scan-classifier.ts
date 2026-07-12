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
  readonly runtime?: string
  readonly releaseId?: string
  readonly title?: string
  readonly providerRef?: {
    readonly provider: string
    readonly ref: string
  }
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
  ["cso", "psp"],
  ["d88", "pc98"],
  ["fdi", "pc98"],
  ["fds", "nes"],
  ["gba", "gba"],
  ["gb", "gb"],
  ["gbc", "gbc"],
  ["gcz", "wii"],
  ["hdi", "pc98"],
  ["hdm", "pc98"],
  ["iso", "disc-image"],
  ["n64", "n64"],
  ["nds", "nds"],
  ["nes", "nes"],
  ["nhd", "pc98"],
  ["nsp", "switch"],
  ["p8", "pico8"],
  ["pce", "tg16"],
  ["qst", "zelda-classic"],
  ["rvz", "wii"],
  ["sfc", "snes"],
  ["sgx", "tg16"],
  ["smc", "snes"],
  ["sms", "sms"],
  ["sna", "zxspectrum"],
  ["tap", "zxspectrum"],
  ["tzx", "zxspectrum"],
  ["v64", "n64"],
  ["wad", "wii"],
  ["wbfs", "wii"],
  ["wua", "wiiu"],
  ["xci", "switch"],
  ["xdf", "pc98"],
  ["z64", "n64"],
  ["z80", "zxspectrum"],
  ["zip", "archive"],
])

const pluginDiscoverableSystems = new Set([
  "gba",
  "genesis",
  "n64",
  "nds",
  "nes",
  "pc98",
  "pico8",
  "psp",
  "psx",
  "sms",
  "snes",
  "switch",
  "tg16",
  "zelda-classic",
  "zxspectrum",
])

const folderSystemAliases = new Map<string, string>([
  ["gamegear", "sms"],
  ["gb", "gb"],
  ["gba", "gba"],
  ["gbc", "gbc"],
  ["genesis", "genesis"],
  ["mastersystem", "sms"],
  ["md", "genesis"],
  ["megadrive", "genesis"],
  ["n64", "n64"],
  ["nds", "nds"],
  ["nes", "nes"],
  ["pc98", "pc98"],
  ["pce", "tg16"],
  ["pcengine", "tg16"],
  ["pico8", "pico8"],
  ["playstation", "psx"],
  ["ps1", "psx"],
  ["psp", "psp"],
  ["psx", "psx"],
  ["sg1000", "sms"],
  ["sms", "sms"],
  ["snes", "snes"],
  ["switch", "switch"],
  ["tg16", "tg16"],
  ["turbografx16", "tg16"],
  ["wii", "wii"],
  ["wiiu", "wiiu"],
  ["zelda-classic", "zelda-classic"],
  ["zeldaclassic", "zelda-classic"],
  ["zxspectrum", "zxspectrum"],
])

export function classifyRomScanPath(
  path: string,
  options: RomScanOptions = {},
): RomScanClassification {
  const storagePath = storageRelativePath(path, options.root)
  const normalized = normalizePath(storagePath)
  const segments = normalized.toLowerCase().split("/").filter(Boolean)
  const rootHint = options.root
    ? basename(options.root).toLowerCase()
    : undefined
  const hintSegments = rootHint ? [rootHint, ...segments] : segments
  const extension = fileExtension(normalized)
  const compoundExtensionSystem = normalized.toLowerCase().endsWith(".p8.png")
    ? "pico8"
    : undefined

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
  if (
    excludedExtensions.has(extension) &&
    compoundExtensionSystem === undefined
  ) {
    return {
      _tag: "Excluded",
      path: normalized,
      reason: `extension:${extension}`,
    }
  }

  const folder = nearestSystemFolder(hintSegments)
  const extensionSystem =
    compoundExtensionSystem ?? systemByExtension.get(extension)
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

  if (
    extensionSystem !== undefined &&
    pluginDiscoverableSystems.has(extensionSystem)
  ) {
    return {
      _tag: "Unclaimed",
      path: normalized,
      system: extensionSystem,
      reason: `unclaimed:${extensionSystem}`,
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
    candidateSortKey(a).localeCompare(candidateSortKey(b)),
  )) {
    const title = classification.title ?? titleFromPath(classification.path)
    const baseId = classification.providerRef
      ? (playableIdFromTitle(title) ?? playableIdFromPath(classification.path))
      : playableIdFromPath(classification.path)
    const id = uniqueId(baseId, usedIds)
    const target = classification.providerRef
      ? {
          kind: "provider-ref" as const,
          provider: classification.providerRef.provider,
          ref: classification.providerRef.ref,
        }
      : {
          kind: "file" as const,
          storage: options.storage,
          path: classification.path,
          discovery: { "first-seen-at": options.firstSeenAt },
        }
    const launch = {
      use: classification.app,
      ...(classification.runtime !== undefined
        ? { runtime: classification.runtime }
        : {}),
    }
    const record: LibraryItemPayload = {
      title,
      releases: [
        {
          id: classification.releaseId ?? classification.system,
          system: classification.system,
          target,
          launch,
        },
      ],
    }
    decodeLibraryItemPayload(record)
    candidates.push({ id, title, classification, record })
  }

  return candidates
}

function candidateSortKey(candidate: RomScanCandidate): string {
  if (candidate.providerRef !== undefined) {
    return `${candidate.providerRef.provider}:${candidate.providerRef.ref}`
  }
  return candidate.path
}

function unsupportedSystemFor(
  folder: string | undefined,
  extension: string,
): string | undefined {
  if (extension === "wua") return "wiiu"
  if (["gcz", "rvz", "wad", "wbfs"].includes(extension)) return "wii"
  if (folder === "wii" && extension === "iso") return "wii"
  // melonDS needs raw .nds — zipped DS dumps stay unsupported. Zipped GBA is
  // deliberately NOT vetoed here: the retroarch plugin's discovery claims
  // gba/*.zip (mGBA loads compressed ROMs), and an Unsupported classification
  // would discard that provider candidate.
  if (folder === "nds" && extension === "zip") return "nds"
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
    if (folderSystemAliases.has(segment)) {
      return folderSystemAliases.get(segment)
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
  const withoutExtension = basenameWithoutKnownCompoundExtension(path)
  return slugify(withoutExtension) || "game"
}

function playableIdFromTitle(title: string): string | undefined {
  const id = slugify(title)
  return id.length > 0 ? id : undefined
}

function titleFromPath(path: string): string {
  const withoutExtension = basenameWithoutKnownCompoundExtension(path)
  const stripped = stripTitleDecorations(withoutExtension)
  return stripped
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function basenameWithoutKnownCompoundExtension(path: string): string {
  const name = basename(path)
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith(".p8.png")) {
    return name.slice(0, -".p8.png".length)
  }
  return basename(path, extname(path))
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
