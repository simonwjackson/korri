import { describe, expect, it } from "bun:test"
import { resolveStreamControlConnector } from "@platform/stream-control/stream-control-session"
import { resolveStreamLauncher } from "@platform/stream/streamer-client"
import {
  createFirstPartyPluginRegistryFromEnv,
  createInteractiveFirstPartyPluginRegistry,
} from "./index"

describe("createInteractiveFirstPartyPluginRegistry", () => {
  it("enables the shipped first-party set when KORRI_ENABLED_PLUGINS is absent", () => {
    // Regression: `korri stream fps 10` over SSH failed with
    // "stream-control.connect: no enabled plugin provides a control session"
    // because login shells do not inherit the units' KORRI_ENABLED_PLUGINS.
    const registry = createInteractiveFirstPartyPluginRegistry({})

    expect(resolveStreamControlConnector(registry)?.provider).toBe(
      "@korri:moonlight",
    )
    expect(resolveStreamLauncher(registry)?.provider).toBe("@korri:moonlight")
    expect(registry.enabledPluginIds.has("@korri:gamescope")).toBe(true)
  })

  it("keeps an explicit KORRI_ENABLED_PLUGINS authoritative, including narrowing", () => {
    const registry = createInteractiveFirstPartyPluginRegistry({
      KORRI_ENABLED_PLUGINS: "@korri:gamescope",
    })

    expect(registry.enabledPluginIds.has("@korri:gamescope")).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:moonlight")).toBe(false)
    expect(resolveStreamControlConnector(registry)).toBeUndefined()
  })

  it("does not change daemon composition semantics (env registry stays fail-closed)", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({})
    expect(registry.enabledPluginIds.size).toBe(0)
  })
})
