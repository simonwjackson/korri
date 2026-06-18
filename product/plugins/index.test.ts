import { describe, expect, it } from "bun:test"
import { executableResources } from "@platform/plugin/registry"
import { createFirstPartyPluginRegistryFromEnv, firstPartyPlugins } from "."
import { KORRI_FEX_PLUGIN_ID } from "./fex-runtime"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "./gamescope"
import { KORRI_MEGA_MAN_ARENA_PLUGIN_ID } from "./mega-man-arena"
import { KORRI_PROTON_GE_PLUGIN_ID } from "./proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "./proton-runtime"
import { KORRI_SRB2_PLUGIN_ID } from "./srb2"

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

  it("enables only default infrastructure when catalog plugins are disabled", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_SRB2_PLUGIN_ID)).toBe(false)
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toMatchObject({
      kind: "launch-wrapper",
    })
    expect(
      registry.runtimes[`${KORRI_FEX_PLUGIN_ID}/linux-user`],
    ).toBeUndefined()
    expect(
      registry.runtimes[`${KORRI_PROTON_PLUGIN_ID}/proton-10`],
    ).toBeUndefined()
    expect(
      registry.runtimes[`${KORRI_PROTON_GE_PLUGIN_ID}/ge-proton-10-34`],
    ).toBeUndefined()
    expect(registry.catalog).toEqual({})
  })

  it("enables Proton-GE only when explicitly requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: "@korri:proton-ge",
    })

    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(true)
    expect(
      registry.runtimes[`${KORRI_PROTON_GE_PLUGIN_ID}/ge-proton-10-34`],
    ).toMatchObject({
      kind: "windows-compatibility",
      title: "GE-Proton10-34",
    })
  })

  it("enables required runtime plugins through Mega Man Arena requirements", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_MEGA_MAN_ARENA_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_MEGA_MAN_ARENA_PLUGIN_ID)).toBe(
      true,
    )
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(false)
    expect(
      registry.runtimes[`${KORRI_FEX_PLUGIN_ID}/linux-user`],
    ).toMatchObject({
      kind: "cpu-translation",
    })
    expect(
      registry.runtimes[`${KORRI_PROTON_PLUGIN_ID}/proton-10`],
    ).toMatchObject({
      kind: "windows-compatibility",
    })
  })

  it("preserves env-enabled first-party catalog plugins", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS:
        "@korri:neverball,@korri:mega-man-arena,@korri:srb2",
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has("@korri:neverball")).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:mega-man-arena")).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_SRB2_PLUGIN_ID)).toBe(true)
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toMatchObject({
      kind: "launch-wrapper",
    })
    expect(Object.keys(registry.catalog)).toEqual([
      "@korri:neverball/neverball",
      "@korri:mega-man-arena/mega-man-arena",
      "@korri:srb2/srb2",
    ])
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["neverball", "mega-man-arena", "srb2"])
  })
})
