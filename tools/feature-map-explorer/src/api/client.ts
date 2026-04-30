import type { FeatureMap } from "../types"

/*
 * Thin fetch wrappers for the dev API. Keeps `fetch` calls out of
 * components and centralizes response shape decoding.
 */

export class ApiError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.payload = payload
  }
}

export type FileResponse = {
  path: string
  frontmatter: Record<string, unknown>
  body: string
  raw: string
}

export type SaveFileRequest = {
  path: string
  frontmatter: Record<string, unknown>
  body: string
}

export type RegenerateResponse = {
  exitCode: number
  stdout: string
  stderr: string
  map: FeatureMap | null
}

export async function fetchFeatureMap(): Promise<FeatureMap> {
  const res = await fetch("/api/feature-map", { cache: "no-store" })
  if (!res.ok) {
    throw await asApiError(res)
  }
  return (await res.json()) as FeatureMap
}

export async function fetchFile(repoPath: string): Promise<FileResponse> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(repoPath)}`, {
    cache: "no-store",
  })
  if (!res.ok) {
    throw await asApiError(res)
  }
  return (await res.json()) as FileResponse
}

export async function saveFile(req: SaveFileRequest): Promise<void> {
  const res = await fetch("/api/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw await asApiError(res)
  }
}

export async function regenerate(): Promise<RegenerateResponse> {
  const res = await fetch("/api/regenerate", { method: "POST" })
  const payload = (await res.json()) as RegenerateResponse
  if (!res.ok) {
    throw new ApiError(res.status, "regenerate failed", payload)
  }
  return payload
}

async function asApiError(res: Response): Promise<ApiError> {
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    // non-JSON error body
  }
  const message = extractMessage(payload) ?? `HTTP ${res.status}`
  return new ApiError(res.status, message, payload)
}

function extractMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message
  }
  return null
}
