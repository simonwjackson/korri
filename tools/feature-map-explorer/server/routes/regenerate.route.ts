import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { Hono } from "hono"
import { FEATURE_MAP_PATH, REPO_ROOT } from "../paths"

/*
 * POST /api/regenerate — shell out to the existing generator.
 *
 * We deliberately spawn `bun run tools/generators/feature-map/...` as a
 * child process rather than calling the generator function directly, so
 * regeneration behavior in the UI matches `just generate-feature-map` and
 * CI exactly. Stdout/stderr/exit code travel back to the client; on
 * success the freshly written map JSON is returned in the same payload
 * (no separate fetch required).
 */

const GENERATOR_PATH = "tools/generators/feature-map/generate-feature-map.ts"

type RegenerateResult = {
  exitCode: number
  stdout: string
  stderr: string
  map: unknown
}

export function regenerateRoute() {
  const app = new Hono()

  app.post("/regenerate", async c => {
    const proc = await runGenerator()
    const map = await readMapOrNull()

    const result: RegenerateResult = {
      exitCode: proc.exitCode,
      stdout: proc.stdout,
      stderr: proc.stderr,
      map,
    }

    const status = proc.exitCode === 0 ? 200 : 500
    return c.json(result, status)
  })

  return app
}

function runGenerator(): Promise<{
  exitCode: number
  stdout: string
  stderr: string
}> {
  return new Promise(resolve => {
    const child = spawn("bun", ["run", GENERATOR_PATH], {
      cwd: REPO_ROOT,
      env: process.env,
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", chunk => {
      stderr += chunk.toString()
    })

    child.on("close", exitCode => {
      resolve({
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
      })
    })
  })
}

async function readMapOrNull(): Promise<unknown> {
  try {
    const raw = await readFile(FEATURE_MAP_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}
