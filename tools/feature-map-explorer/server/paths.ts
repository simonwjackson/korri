import path from "node:path"
import { fileURLToPath } from "node:url"

/*
 * Repo-relative path safety for the dev API.
 *
 * Three layers:
 *   1. resolveRepoPath  — normalize a user-supplied path to an absolute one
 *      under REPO_ROOT, rejecting absolute inputs, traversal segments, and
 *      anything that escapes the root.
 *   2. assertWritablePath — narrow the resolved path to the small allowlist
 *      we permit the UI to overwrite (jobs and feature briefs only).
 *   3. The route handlers — call (1) and (2) before touching the filesystem.
 *
 * Both layers are pure and tested. Route handlers use these helpers
 * exclusively; no inline path math anywhere else in the server.
 */

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))

export const FEATURE_MAP_PATH = path.join(
  REPO_ROOT,
  "out/generated/feature-map/feature-map.json",
)

export type ResolvedPath = {
  absolutePath: string
  repoRelativePath: string
}

export type PathErrorCode =
  | "absolute"
  | "traversal"
  | "outside-repo"
  | "not-allowlisted"

export class PathError extends Error {
  readonly _tag = "PathError"
  readonly code: PathErrorCode

  constructor(code: PathErrorCode, message: string) {
    super(message)
    this.name = "PathError"
    this.code = code
  }
}

/**
 * Resolve a repo-relative input to an absolute path under REPO_ROOT.
 *
 * Rejects:
 * - absolute inputs (e.g. /etc/passwd, C:\Windows)
 * - any segment equal to ".." (traversal, even if it would normalize to
 *   somewhere inside the repo)
 * - resolved paths that fall outside REPO_ROOT (defense in depth)
 *
 * Accepts ".", "./", and explicit `.` segments — these normalize to the
 * input without traversal.
 */
export function resolveRepoPath(input: string): ResolvedPath {
  if (typeof input !== "string" || input.length === 0) {
    throw new PathError("traversal", "path must be a non-empty string")
  }

  if (path.isAbsolute(input)) {
    throw new PathError("absolute", `absolute path not allowed: ${input}`)
  }

  const segments = input.split(/[/\\]+/).filter(Boolean)
  if (segments.some(seg => seg === "..")) {
    throw new PathError("traversal", `path traversal not allowed: ${input}`)
  }

  const absolutePath = path.resolve(REPO_ROOT, input)
  const repoRelativePath = path.relative(REPO_ROOT, absolutePath)

  // Should be unreachable given the checks above, but keep as a guard.
  if (repoRelativePath.startsWith("..") || path.isAbsolute(repoRelativePath)) {
    throw new PathError("outside-repo", `path escapes repo root: ${input}`)
  }

  return {
    absolutePath,
    repoRelativePath: repoRelativePath.split(path.sep).join("/"),
  }
}

/**
 * Allowlist of repo-relative path patterns that the UI may overwrite.
 *
 * Anything outside this list is rejected with a 403. The generated
 * feature-map JSON, BDD `.feature` files, README, and source code are
 * all read-only as far as the dev API is concerned.
 */
const ALLOWED_WRITE_PATTERNS: readonly RegExp[] = [
  /^docs\/jobs\/[^/]+\.md$/,
  /^korri\/products\/[^/]+\/features\/[^/]+\/brief\.md$/,
]

export function assertWritablePath(repoRelativePath: string): void {
  const normalized = repoRelativePath.split(path.sep).join("/")

  for (const pattern of ALLOWED_WRITE_PATTERNS) {
    if (pattern.test(normalized)) return
  }

  throw new PathError(
    "not-allowlisted",
    `path not in writable allowlist: ${repoRelativePath}`,
  )
}
