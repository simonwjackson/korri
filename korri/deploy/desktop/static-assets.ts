import { readFile, stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

export interface StaticAssetOptions {
  assetRoot: string
}

/**
 * Returns true when the URL path is extension-bearing (`.js`, `.css`,
 * `.png`, …). The desktop catch-all routes such requests straight to
 * the static-asset serve so the browser gets the expected MIME type
 * (a missing `.js` is a 404, never an HTML fallback that would corrupt
 * a stale-cached page).
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

export interface ServeIndexOptions extends StaticAssetOptions {
  /**
   * Optional transform applied to the index.html body string before it
   * is returned. Used by the desktop composition to inline the
   * runtime-config `<script>` tag. The transform must not produce
   * partial / invalid HTML; the result is shipped as-is.
   */
  readonly transformIndexHtml?: (html: string) => string
  /**
   * Optional response headers merged onto the rendered index.html
   * response. Used by the desktop composition to set `cache-control:
   * no-store` because the body now varies by runtime-config.
   */
  readonly indexResponseHeaders?: Record<string, string>
}

/**
 * Serve the SPA's `index.html` directly, with an optional body
 * transform. Returns 404 if the file is missing. Kept separate from
 * `serveStaticAsset` so the catch-all can route HTML-shaped requests
 * here (where transformation is meaningful) and asset requests through
 * `serveStaticAsset` (where it isn't).
 */
export async function serveIndexHtml(
  options: ServeIndexOptions,
): Promise<Response> {
  const assetRoot = resolve(options.assetRoot)
  const indexPath = resolve(assetRoot, "index.html")
  const indexBody = await readFileIfPresent(indexPath)
  if (!indexBody) {
    return new Response("Not Found", { status: 404 })
  }

  const transform = options.transformIndexHtml
  if (!transform) {
    return responseForFile(indexPath, indexBody)
  }

  const rewritten = transform(new TextDecoder().decode(indexBody))
  return new Response(rewritten, {
    status: 200,
    headers: {
      "content-type": getContentType(indexPath),
      ...(options.indexResponseHeaders ?? {}),
    },
  })
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
