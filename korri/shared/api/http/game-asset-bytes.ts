import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { DataError } from "@shared/api/rpc/errors"
import { korriDataPath, type XdgPathEnv } from "@shared/config/xdg-paths"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import { gameAssetBlobPath } from "@shared/library/game-assets/game-assets-service"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { Effect } from "effect"

export interface GameAssetBytesOptions {
  readonly env?: XdgPathEnv
}

export const gameAssetByteRoutePrefix = "/api/game-assets/"

const canonicalAssetIdPattern = /^sha256:[a-f0-9]{64}$/
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"])

export async function serveGameAssetBytes(
  request: Request,
  options: GameAssetBytesOptions = {},
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed()
  }

  const assetId = parseAssetId(request)
  if (assetId._tag === "BadRequest") {
    return new Response("Bad Request", { status: 400 })
  }

  let asset: GameAssetRecord | null
  try {
    asset = await findGameAsset(options.env ?? process.env, assetId.value)
  } catch {
    return new Response("Internal Server Error", { status: 500 })
  }

  if (!asset) {
    return new Response("Not Found", { status: 404 })
  }

  if (!supportedMimeTypes.has(asset.mimeType)) {
    return new Response("Unsupported Media Type", { status: 415 })
  }

  const body = await readValidatedGameAssetBytes(
    options.env ?? process.env,
    asset,
  )
  if (!body) {
    return new Response("Not Found", { status: 404 })
  }

  const headers = responseHeaders(asset, body.byteLength)
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers })
  }

  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer

  return new Response(arrayBuffer, { status: 200, headers })
}

function parseAssetId(
  request: Request,
):
  | { readonly _tag: "Ok"; readonly value: string }
  | { readonly _tag: "BadRequest" } {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(gameAssetByteRoutePrefix)) {
    return { _tag: "BadRequest" }
  }

  const encodedSegment = url.pathname.slice(gameAssetByteRoutePrefix.length)
  if (
    encodedSegment.length === 0 ||
    encodedSegment.includes("/") ||
    /%2f/i.test(encodedSegment)
  ) {
    return { _tag: "BadRequest" }
  }

  let decodedSegment: string
  try {
    decodedSegment = decodeURIComponent(encodedSegment)
  } catch {
    return { _tag: "BadRequest" }
  }

  if (
    decodedSegment.includes("/") ||
    decodedSegment.includes("\0") ||
    !canonicalAssetIdPattern.test(decodedSegment)
  ) {
    return { _tag: "BadRequest" }
  }

  return { _tag: "Ok", value: decodedSegment }
}

async function findGameAsset(
  env: XdgPathEnv,
  assetId: string,
): Promise<GameAssetRecord | null> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: libraryRootFromEnv(env),
          writeDebounce: 1,
        }).pipe(
          Effect.mapError(
            error =>
              new DataError({
                reason: "Unavailable",
                message: stringifyError(error),
              }),
          ),
        )
        const assets = yield* Effect.tryPromise({
          try: () => db.gameAssets.query().runPromise,
          catch: error =>
            new DataError({
              reason: "ReadFailed",
              message: stringifyError(error),
            }),
        })
        return (assets.find(asset => asset.id === assetId) ??
          null) as GameAssetRecord | null
      }),
    ),
  )
}

function libraryRootFromEnv(env: XdgPathEnv): string {
  const explicit = env.KORRI_LIBRARY_ROOT?.trim()
  return explicit && explicit.length > 0
    ? explicit
    : korriDataPath(env, "library")
}

export async function hasValidGameAssetBytes(
  env: XdgPathEnv,
  asset: GameAssetRecord,
): Promise<boolean> {
  return (await readValidatedGameAssetBytes(env, asset)) !== null
}

export async function readValidatedGameAssetBytes(
  env: XdgPathEnv,
  asset: GameAssetRecord,
): Promise<Buffer | null> {
  const filePath = gameAssetBlobPath(env, asset)
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile() || fileStat.size !== asset.byteSize) return null

    const body = await readFile(filePath)
    if (body.byteLength !== asset.byteSize) return null

    const digest = createHash("sha256").update(body).digest("hex")
    if (asset.id !== `sha256:${digest}`) return null

    return body
  } catch {
    return null
  }
}

function responseHeaders(asset: GameAssetRecord, byteSize: number): Headers {
  return new Headers({
    "content-type": asset.mimeType,
    "content-length": String(byteSize),
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  })
}

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "GET, HEAD" },
  })
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
