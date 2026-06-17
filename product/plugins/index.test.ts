import { describe, expect, it } from "bun:test"
import { executableResources } from "@platform/plugin/registry"
import { createFirstPartyPluginRegistryFromEnv, firstPartyPlugins } from "."
import { KORRI_GAMESCOPE_PLUGIN_ID } from "./gamescope"

describe("first-party plugins", () => {
  it("registers Gamescope as a first-party handler/config plugin", () => {
    const gamescope = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_GAMESCOPE_PLUGIN_ID,
    )

    expect(
      gamescope?.contributes.config.modules?.["launch-wrapper"],
    ).toMatchObject({
      kind: "launch-wrapper",
      capabilities: ["launch.compose", "launch.wrapper"],
    })
    expect(
      gamescope?.contributes.handlers?.map(handler => handler.operation),
    ).toContain("launch.compose")
  })

  it("does not enable Gamescope unless composition opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(registry.catalog).toEqual({})
  })

  it("preserves env-enabled first-party catalog plugins without implicitly adding Gamescope", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: "@korri:neverball",
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has("@korri:neverball")).toBe(true)
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(Object.keys(registry.catalog)).toEqual([
      "@korri:neverball/neverball",
    ])
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["neverball"])
  })

  it("enables Gamescope when composition explicitly opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: "@korri:gamescope,@korri:neverball",
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:neverball")).toBe(true)
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toMatchObject({
      kind: "launch-wrapper",
    })
  })
})
