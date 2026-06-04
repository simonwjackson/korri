import { mkdirSync, mkdtempSync } from "node:fs"
import path from "node:path"

export function makeOutTempDir(prefix: string): string {
  const parent = path.join(process.cwd(), "out/tmp")
  mkdirSync(parent, { recursive: true })
  return mkdtempSync(path.join(parent, prefix))
}
