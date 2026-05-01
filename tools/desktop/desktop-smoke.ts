import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { logger } from "@shared/logger"
import { createDesktopApp } from "../../korri/deploy/desktop/create-desktop-app"
import { buildArtifactPaths } from "../artifacts/paths"

export type SmokeStatus = "pass" | "fail" | "skip"

export interface SmokeCheck {
  name: string
  status: SmokeStatus
  message: string
}

export interface DesktopSmokeReport {
  ok: boolean
  checks: SmokeCheck[]
}

export interface DesktopSmokeOptions {
  assetRoot?: string
}

async function findFirstFile(directory: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => null,
  )
  if (!entries) {
    return null
  }

  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  )

  for (const entry of sortedEntries) {
    const entryPath = join(directory, entry.name)
    if (entry.isFile()) {
      return entryPath
    }

    if (entry.isDirectory()) {
      const nested = await findFirstFile(entryPath)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

export async function findRepresentativeAsset(
  assetRoot: string,
): Promise<string | null> {
  const assetPath = await findFirstFile(join(assetRoot, "assets"))
  if (!assetPath) {
    return null
  }

  return `/${relative(assetRoot, assetPath).split(sep).join("/")}`
}

async function checkResponse(
  name: string,
  response: Response,
  expectedMessage: string,
): Promise<SmokeCheck> {
  if (response.ok) {
    return { name, status: "pass", message: expectedMessage }
  }

  return {
    name,
    status: "fail",
    message: `${name} returned ${response.status}: ${await response.text()}`,
  }
}

export async function runDesktopSmoke(
  options: DesktopSmokeOptions = {},
): Promise<DesktopSmokeReport> {
  const assetRoot = options.assetRoot ?? buildArtifactPaths.portal
  const indexPath = join(assetRoot, "index.html")
  const checks: SmokeCheck[] = []

  if (!existsSync(indexPath)) {
    return {
      ok: false,
      checks: [
        {
          name: "portal build",
          status: "fail",
          message: `Missing portal index at ${indexPath}`,
        },
      ],
    }
  }

  const app = createDesktopApp({ assetRoot })

  checks.push(
    await checkResponse(
      "portal root",
      await app.fetch(new Request("http://desktop.local/")),
      "GET / returned 200",
    ),
  )

  const healthResponse = await app.fetch(
    new Request("http://desktop.local/api/health"),
  )
  if (healthResponse.ok) {
    const payload = await healthResponse.json()
    checks.push({
      name: "API health",
      status: payload.status === "ok" ? "pass" : "fail",
      message:
        payload.status === "ok"
          ? "GET /api/health returned ok"
          : `GET /api/health returned unexpected status ${String(payload.status)}`,
    })
  } else {
    checks.push(
      await checkResponse("API health", healthResponse, "unreachable"),
    )
  }

  const representativeAsset = await findRepresentativeAsset(assetRoot)
  if (representativeAsset) {
    checks.push(
      await checkResponse(
        "representative asset",
        await app.fetch(
          new Request(`http://desktop.local${representativeAsset}`),
        ),
        `GET ${representativeAsset} returned 200`,
      ),
    )
  } else {
    checks.push({
      name: "representative asset",
      status: "skip",
      message:
        "No assets directory file found; root and API checks still passed.",
    })
  }

  return {
    ok: checks.every(
      check => check.status === "pass" || check.status === "skip",
    ),
    checks,
  }
}

if (import.meta.main) {
  const report = await runDesktopSmoke()
  const log = report.ok ? logger.info.bind(logger) : logger.error.bind(logger)

  log({ checks: report.checks }, "Desktop smoke check completed")

  for (const check of report.checks) {
    process.stderr.write(
      `${check.status.toUpperCase()} ${check.name}: ${check.message}\n`,
    )
  }

  process.exit(report.ok ? 0 : 1)
}
