import { describe, expect, it } from "bun:test"
import { executableResources } from "@platform/plugin/registry"
import { createFirstPartyPluginRegistryFromEnv, firstPartyPlugins } from "."
import { KORRI_FEX_PLUGIN_ID } from "./fex-runtime"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "./gamescope"
import { KORRI_MEGA_MAN_ARENA_PLUGIN_ID } from "./mega-man-arena"
import { KORRI_MEGA_MAN_MAKER_PLUGIN_ID } from "./mega-man-maker"
import { KORRI_PICO8_BBS_PLUGIN_ID } from "./pico8-bbs"
import { KORRI_PROTON_GE_PLUGIN_ID } from "./proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "./proton-runtime"
import { KORRI_PSYCHO_WALUIGI_PLUGIN_ID } from "./psycho-waluigi"
import { KORRI_RYUBING_PLUGIN_ID } from "./ryubing"
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

  it("registers Ryubing as a first-party package plugin", () => {
    const ryubing = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_RYUBING_PLUGIN_ID,
    )

    expect(
      ryubing?.contributes.config.modules?.["ryubing-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
      path: "product/plugins/ryubing/packages/ryubing-korri",
      capabilities: ["package.expose", "launch.runtime"],
    })
  })

  it("does not enable plugin capabilities unless composition opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_SRB2_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PICO8_BBS_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)).toBe(
      false,
    )
    expect(registry.enabledPluginIds.has(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)).toBe(
      false,
    )
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(registry.catalog).toEqual({})
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

  it("enables Ryubing when composition explicitly opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_RYUBING_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_RYUBING_PLUGIN_ID)).toBe(true)
    expect(
      registry.modules[`${KORRI_RYUBING_PLUGIN_ID}/ryubing-korri-package`],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
    })
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

  it("enables required runtime plugins through Psycho Waluigi requirements", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_PSYCHO_WALUIGI_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)).toBe(
      true,
    )
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(true)
    expect(
      registry.catalog[`${KORRI_PSYCHO_WALUIGI_PLUGIN_ID}/psycho-waluigi`],
    ).toMatchObject({
      title: "Psycho Waluigi",
    })
  })

  it("preserves env-enabled first-party catalog plugins", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS:
        "@korri:neverball,@korri:mega-man-arena,@korri:srb2,@korri:psycho-waluigi,@korri:mega-man-maker",
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:neverball")).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:mega-man-arena")).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_SRB2_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)).toBe(
      true,
    )
    expect(registry.enabledPluginIds.has(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)).toBe(
      true,
    )
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(Object.keys(registry.catalog)).toEqual([
      "@korri:neverball/neverball",
      "@korri:mega-man-arena/mega-man-arena",
      "@korri:srb2/srb2",
      "@korri:psycho-waluigi/psycho-waluigi",
    ])
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["neverball", "mega-man-arena", "srb2", "psycho-waluigi"])
  })
})
