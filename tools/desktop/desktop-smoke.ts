import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { logger } from "@shared/logger"
import {
  decodeForegroundSessionStatusSnapshot,
  type ForegroundSessionStatusSnapshot,
} from "@shared/stream/foreground-session-status"
import type { ConnectionStateSnapshot } from "../../korri/deploy/desktop/connection-state-snapshot"
import { createDesktopApp } from "../../korri/deploy/desktop/create-desktop-app"
import type { RuntimeConfig } from "../../korri/deploy/desktop/runtime-config-shape"
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
const noopServer = { hostId: "smoke", controlUrl: "http://smoke.local:3001" }

function connectedSnapshot(): ConnectionStateSnapshot {
  return { status: "connected", server: noopServer }
}

function searchingSnapshot(
  options: { helpAfterMsFromNow?: number } = {},
): ConnectionStateSnapshot {
  const now = Date.now()
  return {
    status: "searching",
    since: new Date(now).toISOString(),
    helpAfter: new Date(
      now + (options.helpAfterMsFromNow ?? 30_000),
    ).toISOString(),
  }
}

function reconnectingSnapshot(hostId: string): ConnectionStateSnapshot {
  const now = Date.now()
  return {
    status: "reconnecting",
    server: { hostId, controlUrl: `http://${hostId}.local:3001` },
    since: new Date(now).toISOString(),
    helpAfter: new Date(now + 30_000).toISOString(),
  }
}

function idleForegroundSessionSnapshot(): ForegroundSessionStatusSnapshot {
  return {
    schemaVersion: 1,
    serverTimestamp: new Date(0).toISOString(),
    state: "IdleReady",
    recentEvents: [],
  }
}

function buildApp(
  assetRoot: string,
  options: {
    snapshot: ConnectionStateSnapshot
    runtime?: RuntimeConfig
    foregroundSessionStatus?: ForegroundSessionStatusSnapshot
  },
) {
  const runtime = options.runtime
  const foregroundSessionStatus =
    options.foregroundSessionStatus ?? idleForegroundSessionSnapshot()
  return createDesktopApp({
    assetRoot,
    getUpstream: noUpstream,
    getConnectionState: () => options.snapshot,
    getRuntimeConfig: runtime ? () => runtime : undefined,
    getForegroundSessionStatus: () => foregroundSessionStatus,
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

  // Default-path checks (connected). Pin liveness + body shape on the
  // serve that runs in production.
  const connectedApp = buildApp(assetRoot, { snapshot: connectedSnapshot() })

  checks.push(
    await passOrFail("portal root", async () => {
      const response = await connectedApp.fetch(
        new Request("http://desktop.local/"),
      )
      return {
        ok: response.ok,
        detail: `GET / returned ${response.status}`,
      }
    }),
  )

  checks.push(
    await passOrFail("API forwarder mounted", async () => {
      const response = await connectedApp.fetch(
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
    }),
  )

  const representativeAsset = await findRepresentativeAsset(assetRoot)
  if (representativeAsset) {
    checks.push(
      await passOrFail("representative asset", async () => {
        const response = await connectedApp.fetch(
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

  // Connection-aware serve branch: body-shape pins. These exercise the
  // U1 contract end-to-end against the real Hono composition with a
  // temp asset root. No mocks; only configured-real snapshot fixtures.
  checks.push(
    await passOrFail("waiting page served when disconnected", async () => {
      const app = buildApp(assetRoot, { snapshot: searchingSnapshot() })
      const response = await app.fetch(new Request("http://desktop.local/"))
      const body = await response.text()
      return {
        ok: response.status === 200 && body.includes("Looking for"),
        detail: `GET / while searching: status ${response.status}, body contains "Looking for": ${body.includes("Looking for")}`,
      }
    }),
  )

  checks.push(
    await passOrFail(
      "waiting page names remembered host when reconnecting",
      async () => {
        const app = buildApp(assetRoot, {
          snapshot: reconnectingSnapshot("aka"),
        })
        const body = await (
          await app.fetch(new Request("http://desktop.local/"))
        ).text()
        return {
          ok: body.includes("aka"),
          detail: `body ${body.includes("aka") ? "contains" : "does not contain"} "aka"`,
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "waiting page omits help block when helpAfter is in the future",
      async () => {
        const app = buildApp(assetRoot, {
          snapshot: searchingSnapshot({ helpAfterMsFromNow: 60_000 }),
        })
        const body = await (
          await app.fetch(new Request("http://desktop.local/"))
        ).text()
        return {
          ok: !body.includes("Still searching"),
          detail: `body ${body.includes("Still searching") ? "unexpectedly contains" : "correctly omits"} help block`,
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "waiting page includes help block when helpAfter is in the past",
      async () => {
        const app = buildApp(assetRoot, {
          snapshot: searchingSnapshot({ helpAfterMsFromNow: -1_000 }),
        })
        const body = await (
          await app.fetch(new Request("http://desktop.local/"))
        ).text()
        return {
          ok: body.includes("Still searching"),
          detail: `body ${body.includes("Still searching") ? "correctly includes" : "is missing"} help block`,
        }
      },
    ),
  )

  // Runtime-config inliner: body-shape pins on the connected serve.
  checks.push(
    await passOrFail(
      "connected serve inlines runtime-config (desktopInput: true)",
      async () => {
        const app = buildApp(assetRoot, {
          snapshot: connectedSnapshot(),
          runtime: { desktopInput: true },
        })
        const body = await (
          await app.fetch(new Request("http://desktop.local/"))
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
      "connected serve inlines runtime-config (desktopInput: false)",
      async () => {
        const app = buildApp(assetRoot, {
          snapshot: connectedSnapshot(),
          runtime: { desktopInput: false },
        })
        const body = await (
          await app.fetch(new Request("http://desktop.local/"))
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
      "foreground-session-status endpoint returns idle snapshot",
      async () => {
        const app = buildApp(assetRoot, { snapshot: connectedSnapshot() })
        const response = await app.fetch(
          new Request(
            "http://desktop.local/__korri/desktop/foreground-session-status",
          ),
        )
        const body = await response.json()
        const decoded = decodeForegroundSessionStatusSnapshot(body)
        const ok =
          response.status === 200 &&
          decoded.schemaVersion === 1 &&
          decoded.state === "IdleReady" &&
          Array.isArray(decoded.recentEvents)
        return {
          ok,
          detail: ok
            ? "JSON shape pinned for idle foreground session"
            : `unexpected JSON ${JSON.stringify(body)}`,
        }
      },
    ),
  )

  // /__korri/desktop/connection-status: JSON wire shape.
  checks.push(
    await passOrFail(
      "connection-status endpoint returns ISO timestamps when searching",
      async () => {
        const app = buildApp(assetRoot, { snapshot: searchingSnapshot() })
        const response = await app.fetch(
          new Request("http://desktop.local/__korri/desktop/connection-status"),
        )
        const body = (await response.json()) as Record<string, unknown>
        const ok =
          body.status === "searching" &&
          typeof body.since === "string" &&
          typeof body.helpAfter === "string" &&
          Number.isFinite(Date.parse(body.since as string)) &&
          Number.isFinite(Date.parse(body.helpAfter as string))
        return {
          ok,
          detail: ok
            ? "JSON shape pinned for searching"
            : `unexpected JSON ${JSON.stringify(body)}`,
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "connection-status endpoint omits timestamps when connected",
      async () => {
        const app = buildApp(assetRoot, { snapshot: connectedSnapshot() })
        const body = (await (
          await app.fetch(
            new Request(
              "http://desktop.local/__korri/desktop/connection-status",
            ),
          )
        ).json()) as Record<string, unknown>
        const server = body.server as Record<string, unknown> | undefined
        const ok =
          body.status === "connected" &&
          typeof server?.hostId === "string" &&
          typeof server?.controlUrl === "string" &&
          body.since === undefined &&
          body.helpAfter === undefined
        return {
          ok,
          detail: ok
            ? "JSON shape pinned for connected"
            : `unexpected JSON ${JSON.stringify(body)}`,
        }
      },
    ),
  )

  // /api/* and /__korri/desktop/rpc must keep behaving as today even
  // during disconnected state. The new branch lives strictly in the
  // static-asset path.
  checks.push(
    await passOrFail(
      "disconnected serve does not interfere with /api/*",
      async () => {
        const app = buildApp(assetRoot, { snapshot: searchingSnapshot() })
        const response = await app.fetch(
          new Request("http://desktop.local/api/health"),
        )
        return {
          ok: response.status === 503,
          detail: `GET /api/health while searching returned ${response.status}`,
        }
      },
    ),
  )

  checks.push(
    await passOrFail(
      "disconnected serve does not interfere with /__korri/desktop/rpc",
      async () => {
        const app = buildApp(assetRoot, { snapshot: searchingSnapshot() })
        const response = await app.fetch(
          new Request("http://desktop.local/__korri/desktop/rpc", {
            method: "POST",
            body: JSON.stringify({ id: "x" }),
          }),
        )
        return {
          ok: response.status === 503,
          detail: `POST /__korri/desktop/rpc while searching returned ${response.status}`,
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
