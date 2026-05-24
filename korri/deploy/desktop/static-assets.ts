import { readFile, stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

export interface StaticAssetOptions {
  assetRoot: string
}

/**
 * Returns true when the URL path is extension-bearing (`.js`, `.css`,
 * `.png`, …). Such requests must never receive the waiting-page HTML
 * during disconnected state: the browser asked for a specific asset
 * type, and returning HTML where JS / CSS was expected would corrupt a
 * stale-cached page. Extension-bearing requests are 404'd if the file
 * isn't on disk.
 */
export function isExtensionBearing(pathname: string): boolean {
  return extname(pathname) !== ""
}

const contentTypes = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
])

export function getContentType(filePath: string): string {
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

function responseForFile(filePath: string, body: Uint8Array): Response {
  const arrayBuffer = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "content-type": getContentType(filePath),
    },
  })
}

async function readFileIfPresent(filePath: string): Promise<Uint8Array | null> {
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return null
    }

    return await readFile(filePath)
  } catch {
    return null
  }
}

export async function serveStaticAsset(
  request: Request,
  options: StaticAssetOptions,
): Promise<Response> {
  const assetRoot = resolve(options.assetRoot)
  const url = new URL(request.url)
  const decodedPathname = decodePathname(url.pathname)

  if (!decodedPathname || decodedPathname.includes("\0")) {
    return new Response("Bad Request", { status: 400 })
  }

  const relativePath = decodedPathname.replace(/^\/+/, "") || "index.html"
  const targetPath = resolve(assetRoot, relativePath)

  if (!isInsideRoot(assetRoot, targetPath)) {
    return new Response("Bad Request", { status: 400 })
  }

  const directBody = await readFileIfPresent(targetPath)
  if (directBody) {
    return responseForFile(targetPath, directBody)
  }

  if (extname(decodedPathname)) {
    return new Response("Not Found", { status: 404 })
  }

  const indexPath = resolve(assetRoot, "index.html")
  const indexBody = await readFileIfPresent(indexPath)
  if (!indexBody) {
    return new Response("Not Found", { status: 404 })
  }

  return responseForFile(indexPath, indexBody)
}
