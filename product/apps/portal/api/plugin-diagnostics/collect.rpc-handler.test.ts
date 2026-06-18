import { afterEach, describe, expect, it } from "bun:test"
import {
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
} from "@product/plugins/steam/src/observability/log-observer"
import { Effect } from "effect"
import { handleCollectPluginDiagnostics } from "./collect.rpc-handler"

const originalEnabledPlugins = process.env.KORRI_ENABLED_PLUGINS

afterEach(() => {
  if (originalEnabledPlugins === undefined) {
    delete process.env.KORRI_ENABLED_PLUGINS
  } else {
    process.env.KORRI_ENABLED_PLUGINS = originalEnabledPlugins
  }
  resetSteamLogObserverStatusForTests()
})

describe("app.plugin.diagnostics.collect handler", () => {
  it("invokes an enabled provider diagnostics handler", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const owner = Symbol("steam-diagnostics-rpc")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "running",
        logDir: "/var/lib/korri/steam/logs",
        watchedFiles: ["content_log.txt"],
        activeFiles: ["content_log.txt"],
        missingFiles: [],
      },
      recentEvidence: [],
    }))

    const result = await Effect.runPromise(
      handleCollectPluginDiagnostics({ providerId: "@korri:steam" }),
    )

    expect(result.providerId).toBe("@korri:steam")
    expect(result.diagnostics).toMatchObject({
      observer: { state: "running" },
    })
  })

  it("returns a typed not-found error for disabled providers", async () => {
    delete process.env.KORRI_ENABLED_PLUGINS

    await expect(
      Effect.runPromise(
        handleCollectPluginDiagnostics({ providerId: "@korri:steam" }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })

  it("returns a typed not-found error for unknown providers", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"

    await expect(
      Effect.runPromise(
        handleCollectPluginDiagnostics({ providerId: "@korri:missing" }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })

  it("returns a typed validation error for malformed provider ids", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"

    await expect(
      Effect.runPromise(
        handleCollectPluginDiagnostics({ providerId: "steam" }),
      ),
    ).rejects.toMatchObject({ _tag: "ValidationError" })
  })
})
