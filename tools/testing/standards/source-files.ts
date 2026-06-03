import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative, sep } from "node:path"

export const REPO_ROOT = process.cwd()

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])
const IGNORED_PARTS = new Set([".git", ".worktrees", "node_modules", "out"])

export function existingRoots(paths: readonly string[]): readonly string[] {
  return paths.filter(path => existsSync(path) && statSync(path).isDirectory())
}

export function sourceFiles(root: string): readonly string[] {
  if (!existsSync(root)) return []

  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_PARTS.has(entry)) continue
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
        continue
      }
      if (SOURCE_EXTENSIONS.has(extname(path))) {
        files.push(path)
      }
    }
  }
  walk(root)
  return files
}

export function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/")
}

export function readSource(path: string): string {
  return readFileSync(path, "utf8")
}
