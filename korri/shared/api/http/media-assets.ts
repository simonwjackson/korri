import { readFile, stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

export interface MediaAssetOptions {
  readonly mediaRoot: string
}

const contentTypes = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
])

export function getMediaContentType(filePath: string): string {
  return (
    contentTypes.get(extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  )
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

function isInsideRoot(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`)
}

async function readMediaFileIfPresent(
  filePath: string,
): Promise<Uint8Array | null> {
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return null
    return await readFile(filePath)
  } catch {
    return null
  }
}

function responseForFile(filePath: string, body: Uint8Array): Response {
  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "content-type": getMediaContentType(filePath),
      "cache-control": "public, max-age=3600",
    },
  })
}

export async function serveMediaAsset(
  request: Request,
  options: MediaAssetOptions,
): Promise<Response> {
  const mediaRoot = resolve(options.mediaRoot)
  const url = new URL(request.url)
  const decodedPathname = decodePathname(url.pathname)

  if (!decodedPathname || decodedPathname.includes("\0")) {
    return new Response("Bad Request", { status: 400 })
  }

  const relativePath = decodedPathname.replace(/^\/api\/media\/?/, "")
  if (!relativePath || relativePath.startsWith("/")) {
    return new Response("Not Found", { status: 404 })
  }

  const targetPath = resolve(mediaRoot, relativePath)
  if (!isInsideRoot(mediaRoot, targetPath)) {
    return new Response("Bad Request", { status: 400 })
  }

  const body = await readMediaFileIfPresent(targetPath)
  if (!body) {
    return new Response("Not Found", { status: 404 })
  }

  return responseForFile(targetPath, body)
}
