import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"

export const DEFAULT_MAX_LEVEL_BYTES = 2 * 1024 * 1024

export interface ValidatedLevelFile {
  readonly path: string
  readonly bytes: number
  readonly digest: string
  readonly content: string
}

export interface ValidatedYfsWebroot {
  readonly root: string
  readonly identity: string
  readonly exportMarker: "html5" | "windows-webview2"
}

function sha256(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex")
}

async function readRequiredFile(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    throw new Error(
      `${label} is not readable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function detectExportMarker(mainSource: string): "html5" | "windows-webview2" {
  if (mainSource.includes('exportType:"html5"')) return "html5"
  if (mainSource.includes('exportType:"windows-webview2"'))
    return "windows-webview2"
  const match = mainSource.match(/exportType:\s*"([^"]+)"/)
  throw new Error(
    `unsupported YFS export marker${match ? `: ${match[1]}` : ""}; expected html5 compatible webroot`,
  )
}

export async function validateYfsWebroot(
  root: string | undefined,
): Promise<ValidatedYfsWebroot> {
  if (!root) throw new Error("KORRI_YFS_WEBROOT is required")
  const resolved = resolve(root)
  const index = await readRequiredFile(
    join(resolved, "index.html"),
    "index.html",
  )
  const main = await readRequiredFile(
    join(resolved, "scripts/main.js"),
    "scripts/main.js",
  )
  const c3main = await readRequiredFile(
    join(resolved, "scripts/c3main.js"),
    "scripts/c3main.js",
  )
  if (!index.includes("scripts/main.js"))
    throw new Error("YFS webroot index.html does not load scripts/main.js")
  if (!c3main.includes("__YFSGetSetting"))
    throw new Error("YFS webroot is missing __YFSGetSetting package hook")
  const exportMarker = detectExportMarker(main)
  const identity = sha256(
    JSON.stringify({
      index: sha256(index),
      main: sha256(main),
      c3main: sha256(c3main),
      exportMarker,
    }),
  )
  return { root: resolved, identity, exportMarker }
}

export async function validateLevelFile(
  path: string,
  options: { readonly maxBytes?: number } = {},
): Promise<ValidatedLevelFile> {
  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(path)
  } catch (error) {
    throw new Error(
      `level file is not readable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!info.isFile())
    throw new Error(`level file is not a regular file: ${path}`)
  if (info.size === 0) throw new Error(`level file is empty: ${path}`)
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_LEVEL_BYTES
  if (info.size > maxBytes)
    throw new Error(`level file is too large: ${info.size} bytes > ${maxBytes}`)
  let content: string
  try {
    content = await readFile(path, "utf8")
  } catch (error) {
    throw new Error(
      `level file is not readable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    JSON.parse(content)
  } catch (error) {
    throw new Error(
      `level file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return {
    path: resolve(path),
    bytes: info.size,
    digest: sha256(content),
    content,
  }
}
