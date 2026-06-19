import { afterEach, describe, expect, it } from "bun:test"
import {
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
} from "@product/plugins/steam/src/observability/log-observer"
import { Effect } from "effect"
import { handleCollectPluginLifecycle } from "./collect.rpc-handler"

const originalEnabledPlugins = process.env.KORRI_ENABLED_PLUGINS

afterEach(() => {
  if (originalEnabledPlugins === undefined) {
    delete process.env.KORRI_ENABLED_PLUGINS
  } else {
    process.env.KORRI_ENABLED_PLUGINS = originalEnabledPlugins
  }
  resetSteamLogObserverStatusForTests()
})

describe("app.plugin.lifecycle.collect handler", () => {
  it("invokes an enabled provider lifecycle handler", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"
    const owner = Symbol("steam-lifecycle-rpc")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "running",
        logDir: "/var/lib/korri/steam/logs",
        watchedFiles: ["console_log.txt"],
        activeFiles: ["console_log.txt"],
        missingFiles: [],
      },
      recentEvidence: [],
      lifecycleEvents: [
        {
          providerId: "@korri:steam",
          sequence: 1,
          observedAt: "2026-06-14T18:38:41.000Z",
          appId: "1029210",
          launchId: "launch-30xx",
          phase: "shader-preparing",
          status: "active",
          confidence: "hint",
          severity: "info",
          displayMessage: "Steam is checking shader cache metadata.",
          nextActionHint: "wait",
          source: "console_log",
          evidence: {
            source: "console_log",
            logFile: "console_log.txt",
            observedAt: "2026-06-14T18:38:41.000Z",
            sequence: 1,
            confidence: "hint",
            parser: "steam-log-signals@1",
            excerpt: "shader",
          },
          steam: { task: "CheckShaderDepotManifest" },
        },
      ],
      lifecycleSummary: {
        providerId: "@korri:steam",
        observerHealth: "running",
        lifecycleStatus: "active",
        providerPhase: "shader-preparing",
        displayMessage: "Steam is checking shader cache metadata.",
        confidence: "hint",
        nextActionHint: "wait",
        appId: "1029210",
        launchId: "launch-30xx",
      },
    }))

    const result = await Effect.runPromise(
      handleCollectPluginLifecycle({
        providerId: "@korri:steam",
        launchId: "launch-30xx",
      }),
    )

    expect(result.providerId).toBe("@korri:steam")
    expect(result.lifecycle).toMatchObject({
      summary: { providerPhase: "shader-preparing" },
      events: [{ launchId: "launch-30xx" }],
    })
  })

  it("returns a typed not-found error for disabled providers", async () => {
    delete process.env.KORRI_ENABLED_PLUGINS

    await expect(
      Effect.runPromise(
        handleCollectPluginLifecycle({ providerId: "@korri:steam" }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError" })
  })

  it("returns a typed validation error for malformed provider ids", async () => {
    process.env.KORRI_ENABLED_PLUGINS = "@korri:steam"

    await expect(
      Effect.runPromise(handleCollectPluginLifecycle({ providerId: "steam" })),
    ).rejects.toMatchObject({ _tag: "ValidationError" })
  })
})
