import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { logger } from "@platform/logger"
import { createDesktopApp } from "../../product/apps/desktop/create-desktop-app"
import type { RuntimeConfig } from "../../product/apps/desktop/runtime-config-shape"
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

const noUpstream = () => undefined

function buildApp(
  assetRoot: string,
  options: {
    runtime?: RuntimeConfig
  } = {},
) {
  const runtime = options.runtime
  return createDesktopApp({
    assetRoot,
    getUpstream: noUpstream,
    getRuntimeConfig: runtime ? () => runtime : undefined,
  })
}

async function passOrFail(
  name: string,
  predicate: () => Promise<{ ok: boolean; detail: string }>,
): Promise<SmokeCheck> {
  try {
    const result = await predicate()
    return {
      name,
      status: result.ok ? "pass" : "fail",
      message: result.detail,
    }
  } catch (error) {
    return {
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
    }
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

  // Federation v1: no more connection-aware serve branch. The catch-all
  // always serves the React bundle; rail-side empty state handles
  // no-upstream (R3 / AE1).
  const app = buildApp(assetRoot)

  checks.push(
    await passOrFail("portal root", async () => {
      const response = await app.fetch(new Request("http://desktop.local/"))
      return {
        ok: response.ok,
        detail: `GET / returned ${response.status}`,
      }
    }),
  )

  checks.push(
    await passOrFail(
      "API forwarder mounted (503 when no upstream)",
      async () => {
        const response = await app.fetch(
          new Request("http://desktop.local/api/health"),
        )
        if (response.status !== 503) {
          return {
            ok: false,
            detail: `GET /api/health returned ${response.status}, expected 503`,
          }
        }
        const payload = (await response.json()) as { error?: string }
        return {
          ok: payload.error === "no upstream",
          detail:
            payload.error === "no upstream"
              ? "GET /api/health returned 503 { error: 'no upstream' }"
              : `GET /api/health returned 503 with unexpected body ${JSON.stringify(payload)}`,
        }
      },
    ),
  )

  const representativeAsset = await findRepresentativeAsset(assetRoot)
  if (representativeAsset) {
    checks.push(
      await passOrFail("representative asset", async () => {
        const response = await app.fetch(
          new Request(`http://desktop.local${representativeAsset}`),
        )
        return {
          ok: response.ok,
          detail: `GET ${representativeAsset} returned ${response.status}`,
        }
      }),
    )
  } else {
    checks.push({
      name: "representative asset",
      status: "skip",
      message:
        "No assets directory file found; root and API checks still passed.",
    })
  }

  // Runtime-config inliner: body-shape pins.
  checks.push(
    await passOrFail(
      "serve inlines runtime-config (desktopInput: true)",
      async () => {
        const appWithRuntime = buildApp(assetRoot, {
          runtime: { desktopInput: true },
        })
        const body = await (
          await appWithRuntime.fetch(new Request("http://desktop.local/"))
        ).text()
        const re =
          /window\.__korriRuntimeConfig\s*=\s*\{[^}]*"desktopInput"\s*:\s*true/
        return {
          ok: re.test(body),
          detail: re.test(body)
            ? "inlined script present with desktopInput: true"
            : "inlined script missing or wrong shape",
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "serve inlines runtime-config (desktopInput: false)",
      async () => {
        const appWithRuntime = buildApp(assetRoot, {
          runtime: { desktopInput: false },
        })
        const body = await (
          await appWithRuntime.fetch(new Request("http://desktop.local/"))
        ).text()
        const re =
          /window\.__korriRuntimeConfig\s*=\s*\{[^}]*"desktopInput"\s*:\s*false/
        return {
          ok: re.test(body),
          detail: re.test(body)
            ? "inlined script present with desktopInput: false"
            : "inlined script missing or wrong shape",
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "legacy /__korri/desktop/foreground-session-status no longer serves JSON (route deleted)",
      async () => {
        const response = await app.fetch(
          new Request(
            "http://desktop.local/__korri/desktop/foreground-session-status",
          ),
        )
        // The bridge endpoint is gone. The path now falls through to the
        // SPA catch-all, so the response is HTML (index.html) rather than
        // JSON. We assert the absence of the JSON content-type to prove
        // the dedicated route is no longer wired.
        const contentType = response.headers.get("content-type") ?? ""
        const ok = !contentType.includes("application/json")
        return {
          ok,
          detail: ok
            ? `bridge endpoint removed; falls through to SPA catch-all (content-type: ${contentType || "<none>"})`
            : `unexpected JSON content-type ${contentType}; bridge endpoint may still be registered`,
        }
      },
    ),
  )

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
