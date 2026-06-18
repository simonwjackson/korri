import { describe, expect, it } from "bun:test"
import { executableResources } from "@platform/plugin/registry"
import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartyLaunchIntegrationsForRegistry,
  firstPartyPlugins,
  firstPartySessionLifecycleHooksForRegistry,
} from "."
import { KORRI_FEX_PLUGIN_ID } from "./fex-runtime"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "./gamescope"
import { KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID } from "./levelsharesquare"
import { KORRI_MEGA_MAN_ARENA_PLUGIN_ID } from "./mega-man-arena"
import { KORRI_MEGA_MAN_MAKER_PLUGIN_ID } from "./mega-man-maker"
import { KORRI_MIDAS_MACHINE_PLUGIN_ID } from "./midas-machine"
import { KORRI_PICO8_PLUGIN_ID } from "./pico8"
import { KORRI_PORTMASTER_PLUGIN_ID } from "./portmaster"
import { KORRI_PROTON_GE_PLUGIN_ID } from "./proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "./proton-runtime"
import { KORRI_PSYCHO_WALUIGI_PLUGIN_ID } from "./psycho-waluigi"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_BSNES_RUNTIME_ID,
  KORRI_RETROARCH_GBA_SYSTEM_ID,
  KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
  KORRI_RETROARCH_GENESIS_SYSTEM_ID,
  KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
  KORRI_RETROARCH_MESEN_RUNTIME_ID,
  KORRI_RETROARCH_MGBA_RUNTIME_ID,
  KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
  KORRI_RETROARCH_N64_SYSTEM_ID,
  KORRI_RETROARCH_NES_SYSTEM_ID,
  KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
  KORRI_RETROARCH_PC98_SYSTEM_ID,
  KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
  KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
  KORRI_RETROARCH_PSP_SYSTEM_ID,
  KORRI_RETROARCH_PSX_SYSTEM_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  KORRI_RETROARCH_SNES_SYSTEM_ID,
  KORRI_RETROARCH_TG16_SYSTEM_ID,
} from "./retroarch"
import { KORRI_RYUBING_PLUGIN_ID } from "./ryubing"
import { KORRI_SMBXGAME_PLUGIN_ID } from "./smbxgame"
import { KORRI_SMWCENTRAL_PLUGIN_ID } from "./smwcentral"
import { KORRI_SRB2_PLUGIN_ID } from "./srb2"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
} from "./steam"
import { KORRI_SUPER_MARIO_BROS_REMASTERED_PLUGIN_ID } from "./super-mario-bros-remastered"

describe("first-party plugins", () => {
  it("registers RetroArch as a first-party app host plugin", () => {
    const retroarch = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_RETROARCH_PLUGIN_ID,
    )

    expect(retroarch?.contributes.config.apps?.retroarch).toMatchObject({
      id: KORRI_RETROARCH_APP_ID,
      kind: KORRI_RETROARCH_PLUGIN_ID,
      command: "retroarch",
    })
  })

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

  it("registers Steam as a first-party app provider plugin", () => {
    const steam = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_STEAM_PLUGIN_ID,
    )

    expect(steam?.contributes.config.apps?.steam).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      kind: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
      plugin: {
        [KORRI_STEAM_PLUGIN_ID]: {
          state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}/Steam` },
          extra: { args: ["-silent", "-gamepadui"] },
        },
      },
    })
    expect(steam?.contributes.config.apps?.steam).not.toHaveProperty("state")
    expect(steam?.contributes.config.apps?.steam).not.toHaveProperty("extra")
    expect(steam?.contributes.config.apps?.steam).not.toHaveProperty(
      "launch-options",
    )
  })

  it("enables RetroArch-owned GBA, Genesis, N64, NES, PC-98, PSP, PSX, SNES, TG16, and core runtimes when requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_RETROARCH_PLUGIN_ID,
    })

    expect(registry.apps[KORRI_RETROARCH_APP_ID]).toBeDefined()
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/gba`]).toMatchObject({
      id: KORRI_RETROARCH_GBA_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mgba`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MGBA_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mgba_libretro.so",
      supports: { systems: [KORRI_RETROARCH_GBA_SYSTEM_ID] },
    })
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/genesis`],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/genesis-plus-gx`],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
      supports: { systems: [KORRI_RETROARCH_GENESIS_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/n64`]).toMatchObject({
      id: KORRI_RETROARCH_N64_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mupen64plus-next`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mupen64plus_next_libretro.so",
      supports: { systems: [KORRI_RETROARCH_N64_SYSTEM_ID] },
    })
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/tg16`],
    ).toMatchObject({
      id: KORRI_RETROARCH_TG16_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mednafen-pce-fast`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MEDNAFEN_PCE_FAST_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mednafen_pce_fast_libretro.so",
      supports: { systems: [KORRI_RETROARCH_TG16_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/nes`]).toMatchObject({
      id: KORRI_RETROARCH_NES_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_MESEN_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mesen`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MESEN_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mesen_libretro.so",
      supports: { systems: [KORRI_RETROARCH_NES_SYSTEM_ID] },
    })
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/pc98`],
    ).toMatchObject({
      id: KORRI_RETROARCH_PC98_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/np2kai`],
    ).toMatchObject({
      id: KORRI_RETROARCH_NP2KAI_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/np2kai_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PC98_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/psp`]).toMatchObject({
      id: KORRI_RETROARCH_PSP_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/ppsspp`],
    ).toMatchObject({
      id: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/ppsspp_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PSP_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/psx`]).toMatchObject({
      id: KORRI_RETROARCH_PSX_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/pcsx-rearmed`],
    ).toMatchObject({
      id: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/pcsx_rearmed_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PSX_SYSTEM_ID] },
    })
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/snes`],
    ).toMatchObject({
      id: KORRI_RETROARCH_SNES_SYSTEM_ID,
      apps: [
        {
          id: KORRI_RETROARCH_APP_ID,
          runtime: KORRI_RETROARCH_BSNES_RUNTIME_ID,
        },
      ],
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/bsnes`],
    ).toMatchObject({
      id: KORRI_RETROARCH_BSNES_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/bsnes_libretro.so",
      supports: { systems: [KORRI_RETROARCH_SNES_SYSTEM_ID] },
    })
  })

  it("filters plugin-owned session lifecycle hooks by enabled provider", () => {
    const disabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: `${KORRI_GAMESCOPE_PLUGIN_ID},${KORRI_STEAM_PLUGIN_ID}`,
    })

    expect(firstPartySessionLifecycleHooksForRegistry(disabled)).toEqual([])
    expect(
      firstPartySessionLifecycleHooksForRegistry(enabled).map(hook => hook.id),
    ).toEqual([KORRI_GAMESCOPE_PLUGIN_ID, KORRI_STEAM_PLUGIN_ID])
  })

  it("filters plugin-owned launch integrations by enabled provider", () => {
    const disabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_RETROARCH_PLUGIN_ID,
    })

    expect(
      firstPartyLaunchIntegrationsForRegistry(disabled).some(
        integration => integration.kind === KORRI_RETROARCH_PLUGIN_ID,
      ),
    ).toBe(false)
    expect(
      firstPartyLaunchIntegrationsForRegistry(enabled).some(
        integration =>
          integration.kind === KORRI_RETROARCH_PLUGIN_ID &&
          integration.integration === "retroarch",
      ),
    ).toBe(true)

    const steamEnabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID,
    })
    expect(
      firstPartyLaunchIntegrationsForRegistry(disabled).some(
        integration => integration.kind === KORRI_STEAM_PLUGIN_ID,
      ),
    ).toBe(false)
    expect(
      firstPartyLaunchIntegrationsForRegistry(steamEnabled).some(
        integration =>
          integration.kind === KORRI_STEAM_PLUGIN_ID &&
          integration.integration === "steam",
      ),
    ).toBe(true)
  })

  it("does not enable plugin capabilities unless composition opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })

    expect(registry.enabledPluginIds.has(KORRI_RETROARCH_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_SRB2_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PICO8_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_PORTMASTER_PLUGIN_ID)).toBe(
      false,
    )
    expect(registry.enabledPluginIds.has(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)).toBe(
      false,
    )
    expect(
      registry.enabledPluginIds.has(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID),
    ).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_SMBXGAME_PLUGIN_ID)).toBe(false)
    expect(registry.enabledPluginIds.has(KORRI_SMWCENTRAL_PLUGIN_ID)).toBe(
      false,
    )
    expect(registry.enabledPluginIds.has(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)).toBe(
      false,
    )
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(registry.apps[KORRI_STEAM_APP_ID]).toBeUndefined()
    expect(registry.catalog).toEqual({})
  })

  it("enables Steam when composition explicitly opts in without auto-enabling Gamescope", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.apps[KORRI_STEAM_APP_ID]).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      kind: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
    })
    expect(registry.storage[KORRI_STEAM_STORAGE_ID]).toMatchObject({
      root: "/var/lib/korri/steam",
    })
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

  it("enables SMBR package when Level Share Square is explicitly requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
    })

    expect(
      registry.enabledPluginIds.has(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID),
    ).toBe(true)
    expect(
      registry.enabledPluginIds.has(
        KORRI_SUPER_MARIO_BROS_REMASTERED_PLUGIN_ID,
      ),
    ).toBe(true)
    expect(
      registry.catalog[
        `${KORRI_SUPER_MARIO_BROS_REMASTERED_PLUGIN_ID}/super-mario-bros-remastered`
      ],
    ).toMatchObject({ title: "Super Mario Bros. Remastered" })
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

  it("enables PortMaster when composition explicitly opts in", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_PORTMASTER_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_PORTMASTER_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_RETROARCH_PLUGIN_ID)).toBe(true)
    expect(
      registry.runtimes[`${KORRI_FEX_PLUGIN_ID}/linux-user`],
    ).toMatchObject({
      kind: "cpu-translation",
    })
    expect(registry.apps[KORRI_RETROARCH_APP_ID]).toMatchObject({
      command: "retroarch",
    })
    expect(
      registry.modules[`${KORRI_PORTMASTER_PLUGIN_ID}/portmaster`],
    ).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#portmaster",
        binary: "portmaster",
      },
    })
  })

  it("does not auto-enable RetroArch when PICO-8 is requested alone", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_PICO8_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_PICO8_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_RETROARCH_PLUGIN_ID)).toBe(false)
    expect(registry.systems[`${KORRI_PICO8_PLUGIN_ID}/pico8`]).toBeDefined()
    expect(registry.apps[KORRI_RETROARCH_APP_ID]).toBeUndefined()
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
        "@korri:neverball,@korri:mega-man-arena,@korri:srb2,@korri:psycho-waluigi,@korri:mega-man-maker,@korri:midas-machine,@korri:smbxgame,@korri:smwcentral",
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
    expect(registry.enabledPluginIds.has(KORRI_MIDAS_MACHINE_PLUGIN_ID)).toBe(
      true,
    )
    expect(registry.enabledPluginIds.has(KORRI_SMBXGAME_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_SMWCENTRAL_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)).toBe(
      true,
    )
    expect(
      registry.modules[`${KORRI_GAMESCOPE_PLUGIN_ID}/launch-wrapper`],
    ).toBeUndefined()
    expect(Object.keys(registry.catalog)).toEqual([
      "@korri:neverball/neverball",
      "@korri:mega-man-arena/mega-man-arena",
      "@korri:mega-man-maker/mega-man-maker",
      "@korri:midas-machine/midas-machine",
      "@korri:srb2/srb2",
      "@korri:psycho-waluigi/psycho-waluigi",
    ])
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual([
      "neverball",
      "mega-man-arena",
      "mega-man-maker",
      "midas-machine",
      "srb2",
      "psycho-waluigi",
    ])
  })
})
