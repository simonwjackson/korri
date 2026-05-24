import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import {
  DataError,
  type NotFoundError,
  ValidationError,
} from "@shared/api/rpc/errors"
import { korriDataPath, type XdgPathEnv } from "@shared/config/xdg-paths"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import type { GameAssetRole } from "@shared/library/config/records/game-asset-assignment"
import { Effect } from "effect"
import type { CandidateCache, GameAssetCandidate } from "./candidate-cache"
import type { GameAssetsRepository } from "./game-assets-repository"

export interface GameAssetsServiceOptions {
  readonly env: XdgPathEnv
  readonly candidateCache: CandidateCache
  readonly repository: GameAssetsRepository
  readonly limits?: Partial<GameAssetValidationLimits>
}

export interface GameAssetValidationLimits {
  readonly maxByteSize: number
  readonly maxDimension: number
  readonly maxPixels: number
}

export interface AssignGameAssetInput {
  readonly gameId: string
  readonly role: GameAssetRole
  readonly candidateId: string
}

export interface AssignedGameAsset {
  readonly asset: GameAssetRecord
  readonly assignment: {
    readonly id: string
    readonly gameId: string
    readonly role: GameAssetRole
    readonly assetId: string
  }
}

export interface GameAssetsService {
  readonly listCandidates: (input?: {
    readonly gameId?: string
    readonly role?: GameAssetRole
  }) => Effect.Effect<readonly GameAssetCandidate[], DataError>
  readonly assignCandidate: (
    input: AssignGameAssetInput,
  ) => Effect.Effect<
    AssignedGameAsset,
    DataError | NotFoundError | ValidationError
  >
}

const defaultLimits: GameAssetValidationLimits = {
  maxByteSize: 20 * 1024 * 1024,
  maxDimension: 16_384,
  maxPixels: 67_108_864,
}

export function createGameAssetsService(
  options: GameAssetsServiceOptions,
): GameAssetsService {
  const limits = { ...defaultLimits, ...options.limits }

  return {
    listCandidates: input => options.candidateCache.listCandidates(input),

    assignCandidate: input =>
      Effect.gen(function* () {
        yield* options.repository.ensureGameExists(input.gameId)

        const candidate = yield* options.candidateCache.resolveCandidate(
          input.candidateId,
        )
        if (candidate.gameId !== input.gameId) {
          return yield* Effect.fail(
            new ValidationError({
              message: "candidate does not belong to the requested game",
            }),
          )
        }
        if (candidate.role !== input.role) {
          return yield* Effect.fail(
            new ValidationError({
              message:
                "candidate role does not match requested assignment role",
            }),
          )
        }

        const sourcePath =
          yield* options.candidateCache.resolveCandidateFilePath(candidate)
        const bytes = yield* readCandidateBytes(sourcePath)
        const image = yield* validateImageBytes(bytes, limits)
        const digest = createHash("sha256").update(bytes).digest("hex")
        const asset: GameAssetRecord = {
          id: `sha256:${digest}`,
          type: "image",
          mimeType: image.mimeType,
          extension: image.extension,
          width: image.width,
          height: image.height,
          byteSize: bytes.byteLength,
          pixelCount: image.width * image.height,
          storage: { strategy: "content-addressed" },
          source: candidate.source,
        }

        yield* promoteBytes(options.env, asset, bytes)

        const assignment = {
          id: `${input.gameId}:${input.role}`,
          gameId: input.gameId,
          role: input.role,
          assetId: asset.id,
        }
        return yield* options.repository.upsertAssetAssignment({
          asset,
          assignment,
        })
      }),
  }
}

export function gameAssetBlobPath(
  env: XdgPathEnv,
  asset: Pick<GameAssetRecord, "id" | "extension">,
): string {
  if (typeof asset.id !== "string") {
    throw new TypeError(
      `game asset id must be a string, received ${JSON.stringify(asset)}`,
    )
  }
  const match = asset.id.match(/^sha256:([a-f0-9]{64})$/)
  if (!match) {
    throw new TypeError(
      `game asset id must be a canonical sha256 digest: ${asset.id}`,
    )
  }
  const digest = match[1]
  return join(
    korriDataPath(env, "game-assets", "blobs"),
    "sha256",
    digest.slice(0, 2),
    `${digest}.${asset.extension}`,
  )
}

function readCandidateBytes(path: string): Effect.Effect<Buffer, DataError> {
  return Effect.tryPromise({
    try: () => readFile(path),
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message: `failed to read game asset candidate bytes: ${stringifyError(error)}`,
      }),
  })
}

function promoteBytes(
  env: XdgPathEnv,
  asset: GameAssetRecord,
  bytes: Buffer,
): Effect.Effect<void, DataError> {
  return Effect.tryPromise({
    try: async () => {
      const target = gameAssetBlobPath(env, asset)
      const targetDir = dirname(target)
      await mkdir(targetDir, { recursive: true })
      const tempPath = join(
        targetDir,
        `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
      )
      try {
        await writeFile(tempPath, bytes, { flag: "wx" })
        await rename(tempPath, target)
      } catch (error) {
        await rm(tempPath, { force: true }).catch(() => undefined)
        throw error
      }
    },
    catch: error =>
      new DataError({
        reason: "WriteFailed",
        message: `failed to promote game asset bytes: ${stringifyError(error)}`,
      }),
  })
}

interface ProbedImage {
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp"
  readonly extension: "png" | "jpg" | "webp"
  readonly width: number
  readonly height: number
}

function validateImageBytes(
  bytes: Buffer,
  limits: GameAssetValidationLimits,
): Effect.Effect<ProbedImage, ValidationError> {
  return Effect.try({
    try: () => {
      if (bytes.byteLength <= 0) {
        throw new ImageValidationError("candidate image file is empty")
      }
      if (bytes.byteLength > limits.maxByteSize) {
        throw new ImageValidationError("candidate image file is too large")
      }

      const probed = probeImage(bytes)
      if (!probed) {
        throw new ImageValidationError(
          "candidate image bytes are not a supported raster image",
        )
      }

      if (probed.width <= 0 || probed.height <= 0) {
        throw new ImageValidationError(
          "candidate image dimensions must be positive",
        )
      }
      if (
        probed.width > limits.maxDimension ||
        probed.height > limits.maxDimension
      ) {
        throw new ImageValidationError(
          "candidate image dimensions exceed the configured limit",
        )
      }
      if (probed.width * probed.height > limits.maxPixels) {
        throw new ImageValidationError(
          "candidate image pixel count exceeds the configured limit",
        )
      }

      return probed
    },
    catch: error =>
      new ValidationError({
        message:
          error instanceof ImageValidationError
            ? error.message
            : stringifyError(error),
      }),
  })
}

function probeImage(bytes: Buffer): ProbedImage | undefined {
  return probePng(bytes) ?? probeJpeg(bytes) ?? probeWebp(bytes)
}

function probePng(bytes: Buffer): ProbedImage | undefined {
  if (bytes.byteLength < 24) return undefined
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return undefined
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return undefined
  return {
    mimeType: "image/png",
    extension: "png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

function probeJpeg(bytes: Buffer): ProbedImage | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return undefined

  let offset = 2
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1]
    offset += 2

    if (marker === 0xd9 || marker === 0xda) return undefined
    if (offset + 2 > bytes.byteLength) return undefined
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.byteLength) return undefined

    if (isJpegStartOfFrame(marker)) {
      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      }
    }

    offset += length
  }

  return undefined
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  )
}

function probeWebp(bytes: Buffer): ProbedImage | undefined {
  if (bytes.byteLength < 30) return undefined
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    return undefined

  const chunk = bytes.toString("ascii", 12, 16)
  if (chunk === "VP8X" && bytes.byteLength >= 30) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27),
    }
  }

  if (chunk === "VP8L" && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21)
    return {
      mimeType: "image/webp",
      extension: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }

  if (chunk === "VP8 " && bytes.byteLength >= 30) {
    const startCodeOffset = 23
    if (
      bytes[startCodeOffset] !== 0x9d ||
      bytes[startCodeOffset + 1] !== 0x01 ||
      bytes[startCodeOffset + 2] !== 0x2a
    ) {
      return undefined
    }
    return {
      mimeType: "image/webp",
      extension: "webp",
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    }
  }

  return undefined
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16)
}

class ImageValidationError extends Error {}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
