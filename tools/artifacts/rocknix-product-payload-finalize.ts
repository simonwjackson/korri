import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type FinalizeRocknixProductPayloadInput = {
  readonly candidateLockPath: string
  readonly outputDir: string
  readonly sourceSha256: string
  readonly productRevision: string
  readonly seedUrls: readonly string[]
}

export type FinalizeRocknixProductPayloadResult = {
  readonly lockPath: string
  readonly envPath: string
  readonly manifestPath: string
}

type CandidatePayload = Record<string, string>

const requiredCandidateFields = [
  "PRODUCT_AUTHORITY_REPO",
  "PRODUCT_REV",
  "PRODUCT_SOURCE_SUBDIR",
  "PRODUCT_BUILD_TARGET",
  "PRODUCT_ROOTFS_SEED_REV",
  "PRODUCT_ROOTFS_SEED_DEVICE",
  "PRODUCT_ROOTFS_SEED_COMPATIBLE",
  "PRODUCT_ROOTFS_SEED_ARCHIVE",
  "PRODUCT_ROOTFS_SEED_SHA256",
] as const

const sha256Pattern = /^[a-f0-9]{64}$/i
const revisionPattern = /^[a-f0-9]{40}$/i

export function finalizeRocknixProductPayload(
  input: FinalizeRocknixProductPayloadInput,
): FinalizeRocknixProductPayloadResult {
  const candidate = readCandidatePayload(input.candidateLockPath)
  validateCandidate(candidate, input)

  const authorityRepo = candidate.PRODUCT_AUTHORITY_REPO
  const authorityName = authorityRepo.split("/").at(-1) ?? authorityRepo
  const device = candidate.PRODUCT_ROOTFS_SEED_DEVICE
  const seedUrls = input.seedUrls.join(" ")
  const firstSeedUrl = input.seedUrls[0] ?? ""
  const productUrl = `https://api.github.com/repos/${authorityRepo}/tarball/${input.productRevision}`

  const lockFields: readonly [string, string][] = [
    ["PRODUCT_AUTHORITY_REPO", authorityRepo],
    ["PRODUCT_REV", input.productRevision],
    ["PRODUCT_SOURCE_SHA256", input.sourceSha256],
    ["PRODUCT_SOURCE_SUBDIR", candidate.PRODUCT_SOURCE_SUBDIR],
    ["PRODUCT_BUILD_TARGET", candidate.PRODUCT_BUILD_TARGET],
    ["PRODUCT_ROOTFS_SEED_REV", input.productRevision],
    ["PRODUCT_ROOTFS_SEED_DEVICE", candidate.PRODUCT_ROOTFS_SEED_DEVICE],
    [
      "PRODUCT_ROOTFS_SEED_COMPATIBLE",
      candidate.PRODUCT_ROOTFS_SEED_COMPATIBLE,
    ],
    ["PRODUCT_ROOTFS_SEED_ARCHIVE", candidate.PRODUCT_ROOTFS_SEED_ARCHIVE],
    ["PRODUCT_ROOTFS_SEED_SHA256", candidate.PRODUCT_ROOTFS_SEED_SHA256],
    ["PRODUCT_ROOTFS_SEED_URL", firstSeedUrl],
    ["PRODUCT_ROOTFS_SEED_URLS", seedUrls],
  ]

  const envFields: readonly [string, string][] = [
    ["PKG_NIX_GUEST_AUTHORITY_REPO", authorityRepo],
    ["PKG_NIX_GUEST_AUTHORITY_NAME", authorityName],
    ["PKG_NIX_GUEST_REV", input.productRevision],
    ["PKG_NIX_GUEST_SHA256", input.sourceSha256],
    ["PKG_NIX_GUEST_URL", productUrl],
    ["PKG_NIX_GUEST_SOURCE_SUBDIR", candidate.PRODUCT_SOURCE_SUBDIR],
    ["PKG_NIX_GUEST_BUILD_TARGET", candidate.PRODUCT_BUILD_TARGET],
    ["PKG_NIX_GUEST_ROOTFS_SEED_REV", input.productRevision],
    ["PKG_NIX_GUEST_ROOTFS_SEED_DEVICE", candidate.PRODUCT_ROOTFS_SEED_DEVICE],
    [
      "PKG_NIX_GUEST_ROOTFS_SEED_COMPATIBLE",
      candidate.PRODUCT_ROOTFS_SEED_COMPATIBLE,
    ],
    [
      "PKG_NIX_GUEST_ROOTFS_SEED_ARCHIVE",
      candidate.PRODUCT_ROOTFS_SEED_ARCHIVE,
    ],
    ["PKG_NIX_GUEST_ROOTFS_SEED_SHA256", candidate.PRODUCT_ROOTFS_SEED_SHA256],
    ["PKG_NIX_GUEST_ROOTFS_SEED_URL", firstSeedUrl],
    ["PKG_NIX_GUEST_ROOTFS_SEED_URLS", seedUrls],
  ]

  mkdirSync(input.outputDir, { recursive: true })
  const lockPath = join(input.outputDir, `product-payload-${device}.lock`)
  const envPath = join(input.outputDir, `product-payload-${device}.env`)
  const manifestPath = join(input.outputDir, "manifest.txt")

  writeFileSync(lockPath, renderShellFields(lockFields))
  writeFileSync(envPath, renderShellFields(envFields))
  writeFileSync(
    manifestPath,
    [
      `authority_repo=${authorityRepo}`,
      `product_rev=${input.productRevision}`,
      `source_sha256=${input.sourceSha256}`,
      `source_subdir=${candidate.PRODUCT_SOURCE_SUBDIR}`,
      `build_target=${candidate.PRODUCT_BUILD_TARGET}`,
      `rootfs_seed_device=${candidate.PRODUCT_ROOTFS_SEED_DEVICE}`,
      `rootfs_seed_compatible=${candidate.PRODUCT_ROOTFS_SEED_COMPATIBLE}`,
      `rootfs_seed_archive=${candidate.PRODUCT_ROOTFS_SEED_ARCHIVE}`,
      `rootfs_seed_sha256=${candidate.PRODUCT_ROOTFS_SEED_SHA256}`,
      `rootfs_seed_urls=${seedUrls}`,
      `substrate_rev=${candidate.PRODUCT_SUBSTRATE_REV ?? ""}`,
      "",
    ].join("\n"),
  )

  return { lockPath, envPath, manifestPath }
}

function readCandidatePayload(candidateLockPath: string): CandidatePayload {
  const content = readFileSync(candidateLockPath, "utf8")
  const fields: CandidatePayload = {}

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue
    }

    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u)
    if (!match) {
      throw new Error(
        `candidate payload lock has unsupported syntax on line ${index + 1}`,
      )
    }

    const [, key, rawValue] = match
    fields[key] = parseShellAssignmentValue(rawValue)
  }

  return fields
}

function validateCandidate(
  candidate: CandidatePayload,
  input: FinalizeRocknixProductPayloadInput,
) {
  for (const field of requiredCandidateFields) {
    requireNonempty(field, candidate[field])
  }

  validateInputDigests(candidate, input)
  validateCandidateRevision(candidate, input.productRevision)
  validateCandidateIdentity(candidate)
  validateSeedArchiveName(candidate)
  validateSeedUrls(candidate.PRODUCT_AUTHORITY_REPO, input.seedUrls)
}

function validateInputDigests(
  candidate: CandidatePayload,
  input: FinalizeRocknixProductPayloadInput,
) {
  if (!revisionPattern.test(input.productRevision)) {
    throw new Error("finalization requires an explicit clean Korri revision")
  }
  if (!sha256Pattern.test(input.sourceSha256)) {
    throw new Error("source SHA256 must be a 64-character hex digest")
  }
  if (!sha256Pattern.test(candidate.PRODUCT_ROOTFS_SEED_SHA256)) {
    throw new Error(
      "candidate rootfs seed SHA256 must be a 64-character hex digest",
    )
  }
}

function validateCandidateRevision(
  candidate: CandidatePayload,
  productRevision: string,
) {
  if (candidate.PRODUCT_REV_CLEAN !== "1") {
    throw new Error("candidate payload must come from a clean Korri revision")
  }
  if (
    candidate.PRODUCT_REV !== productRevision ||
    candidate.PRODUCT_ROOTFS_SEED_REV !== productRevision
  ) {
    throw new Error(
      "candidate payload revision must match the clean Korri revision",
    )
  }
}

function validateCandidateIdentity(candidate: CandidatePayload) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(candidate.PRODUCT_ROOTFS_SEED_DEVICE)) {
    throw new Error("candidate payload device must be a safe product id")
  }
}

function validateSeedArchiveName(candidate: CandidatePayload) {
  const expectedArchivePrefix = `rocknix-guest-rootfs-${candidate.PRODUCT_ROOTFS_SEED_DEVICE}-`
  if (
    !candidate.PRODUCT_ROOTFS_SEED_ARCHIVE.startsWith(expectedArchivePrefix) ||
    !candidate.PRODUCT_ROOTFS_SEED_ARCHIVE.endsWith(".tar.zst")
  ) {
    throw new Error(
      "candidate seed archive name must match the declared device prefix",
    )
  }
}

function validateSeedUrls(authorityRepo: string, seedUrls: readonly string[]) {
  if (seedUrls.length === 0) {
    throw new Error("at least one rootfs seed release URL is required")
  }
  for (const seedUrl of seedUrls) {
    validateReleaseUrl(authorityRepo, seedUrl)
  }
}

function requireNonempty(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} must not be empty`)
  }
}

function validateReleaseUrl(authorityRepo: string, seedUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(seedUrl)
  } catch {
    throw new Error(`release URL is malformed: ${seedUrl}`)
  }

  const releasePrefix = `/${authorityRepo}/releases/download/`
  const supported =
    parsed.protocol === "https:" &&
    parsed.hostname === "github.com" &&
    parsed.pathname.startsWith(releasePrefix)

  if (!supported) {
    throw new Error(
      `release URL must point at a direct ${authorityRepo} GitHub release download`,
    )
  }
}

function renderShellFields(fields: readonly (readonly [string, string])[]) {
  return `${fields
    .map(([name, value]) => `${name}=${quoteShellValue(value)}`)
    .join("\n")}\n`
}

function quoteShellValue(value: string) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("$", "\\$")
    .replaceAll("`", "\\`")
    .replaceAll("\n", "\\n")}"`
}

function parseShellAssignmentValue(rawValue: string) {
  const value = rawValue.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuotedShell(value.slice(1, -1))
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  const commentStart = value.indexOf("#")
  return (commentStart === -1 ? value : value.slice(0, commentStart)).trim()
}

function unescapeDoubleQuotedShell(value: string) {
  let output = ""
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "\\" && index + 1 < value.length) {
      output += value[index + 1]
      index += 1
    } else {
      output += char
    }
  }
  return output
}

if (import.meta.main) {
  const parsed = parseCliArgs(process.argv.slice(2))
  finalizeRocknixProductPayload(parsed)
}

function parseCliArgs(
  args: readonly string[],
): FinalizeRocknixProductPayloadInput {
  const values = new Map<string, string[]>()
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    const value = args[index + 1]
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error(
        "usage: rocknix-product-payload-finalize --candidate <path> --out <dir> --source-sha256 <sha> --product-rev <rev> --seed-url <url> [--seed-url <url>]",
      )
    }
    index += 1
    const existing = values.get(name) ?? []
    existing.push(value)
    values.set(name, existing)
  }

  return {
    candidateLockPath: singleArg(values, "--candidate"),
    outputDir: singleArg(values, "--out"),
    sourceSha256: singleArg(values, "--source-sha256"),
    productRevision: singleArg(values, "--product-rev"),
    seedUrls: values.get("--seed-url") ?? [],
  }
}

function singleArg(values: Map<string, string[]>, name: string) {
  const entries = values.get(name) ?? []
  if (entries.length !== 1) {
    throw new Error(`expected exactly one ${name}`)
  }
  return entries[0]
}
