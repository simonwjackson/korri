import { describe, expect, it } from "bun:test"
import { executableResources } from "@platform/plugin/registry"
import {
  KORRI_3DSEN_APP_ID,
  KORRI_3DSEN_PLUGIN_ID,
} from "@product/plugins/3dsen"
import { KORRI_BOX64_RUNTIME_PLUGIN_ID } from "@product/plugins/box64-runtime"
import { KORRI_FEX_PLUGIN_ID } from "@product/plugins/fex-runtime"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_GMLOADER_PLUGIN_ID } from "@product/plugins/gmloader"
import { KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID } from "@product/plugins/levelsharesquare"
import { KORRI_MEGA_MAN_ARENA_PLUGIN_ID } from "@product/plugins/mega-man-arena"
import { KORRI_MEGA_MAN_MAKER_PLUGIN_ID } from "@product/plugins/mega-man-maker"
import { KORRI_MIDAS_MACHINE_PLUGIN_ID } from "@product/plugins/midas-machine"
import {
  KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID,
  KORRI_PICO8_PLUGIN_ID,
} from "@product/plugins/pico8"
import { KORRI_PORTMASTER_PLUGIN_ID } from "@product/plugins/portmaster"
import { KORRI_PROTON_GE_PLUGIN_ID } from "@product/plugins/proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "@product/plugins/proton-runtime"
import { KORRI_PSYCHO_WALUIGI_PLUGIN_ID } from "@product/plugins/psycho-waluigi"
import { KORRI_REMAP_PLUGIN_ID } from "@product/plugins/remap"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_BSNES_RUNTIME_ID,
  KORRI_RETROARCH_FUSE_RUNTIME_ID,
  KORRI_RETROARCH_GBA_DISCOVERY_PROVIDER_ID,
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
  KORRI_RETROARCH_PLUGIN_ID,
  KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
  KORRI_RETROARCH_PSP_SYSTEM_ID,
  KORRI_RETROARCH_PSX_SYSTEM_ID,
  KORRI_RETROARCH_SMS_SYSTEM_ID,
  KORRI_RETROARCH_SNES_SYSTEM_ID,
  KORRI_RETROARCH_TG16_SYSTEM_ID,
  KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
} from "@product/plugins/retroarch"
import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  KORRI_RPCS3_RUNTIME_ID,
} from "@product/plugins/rpcs3"
import {
  KORRI_RYUBING_APP_ID,
  KORRI_RYUBING_DISCOVERY_PROVIDER_ID,
  KORRI_RYUBING_PLUGIN_ID,
  KORRI_RYUBING_STATE_STORAGE_ID,
} from "@product/plugins/ryubing"
import { KORRI_SMB_WONDERLAND_1987_PLUGIN_ID } from "@product/plugins/smb-wonderland-1987"
import { KORRI_SMBXGAME_PLUGIN_ID } from "@product/plugins/smbxgame"
import { KORRI_SMWCENTRAL_PLUGIN_ID } from "@product/plugins/smwcentral"
import { KORRI_SRB2_PLUGIN_ID } from "@product/plugins/srb2"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
} from "@product/plugins/steam"
import { KORRI_SUPER_MARIO_BROS_REMASTERED_PLUGIN_ID } from "@product/plugins/super-mario-bros-remastered"
import {
  KORRI_TURNIP_PLUGIN_ID,
  KORRI_TURNIP_WRAPPER_PACKAGE,
} from "@product/plugins/turnip"
import {
  KORRI_ZQUEST_CLASSIC_APP_ID,
  KORRI_ZQUEST_CLASSIC_DISCOVERY_PROVIDER_ID,
  KORRI_ZQUEST_CLASSIC_PACKAGE,
  KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
  KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
} from "@product/plugins/zquest-classic"
import {
  createFirstPartyPluginRegistryFromEnv,
  firstPartyLaunchIntegrationsForRegistry,
  firstPartyPlugins,
  firstPartySessionLifecycleHooksForRegistry,
} from "."

describe("first-party plugins", () => {
  it("registers RetroArch as a first-party app host plugin", () => {
    const retroarch = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_RETROARCH_PLUGIN_ID,
    )

    expect(retroarch?.contributes.config.launchers?.retroarch).toMatchObject({
      id: KORRI_RETROARCH_APP_ID,
      plugin: KORRI_RETROARCH_PLUGIN_ID,
      command: "/etc/korri/bin/retroarch",
    })
  })

  it("registers RPCS3 as a first-party PS3 app host plugin", () => {
    const rpcs3 = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_RPCS3_PLUGIN_ID,
    )

    expect(rpcs3?.contributes.config.launchers?.rpcs3).toMatchObject({
      id: KORRI_RPCS3_APP_ID,
      plugin: KORRI_RPCS3_PLUGIN_ID,
      command: "/run/current-system/sw/bin/rpcs3",
    })
    expect(rpcs3?.contributes.config.runtimes?.rpcs3).toMatchObject({
      id: KORRI_RPCS3_RUNTIME_ID,
      kind: "emulator",
    })
    expect(rpcs3?.contributes.discovery?.map(provider => provider.id)).toEqual([
      KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
    ])
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

  it("registers Remap as a first-party launch companion plugin", () => {
    const remap = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_REMAP_PLUGIN_ID,
    )

    expect(remap?.contributes.config.modules?.["launch-wrapper"]).toMatchObject(
      {
        kind: "launch-wrapper",
        capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
      },
    )
  })

  it("registers Ryubing as a first-party package plugin", () => {
    const ryubing = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_RYUBING_PLUGIN_ID,
    )

    expect(ryubing?.contributes.config.storage?.state).toMatchObject({
      id: KORRI_RYUBING_STATE_STORAGE_ID,
      root: "/var/lib/korri/ryubing",
    })
    expect(ryubing?.contributes.config.launchers?.ryubing).toMatchObject({
      id: KORRI_RYUBING_APP_ID,
      plugin: KORRI_RYUBING_PLUGIN_ID,
      command: "Ryujinx",
    })
    expect(
      ryubing?.contributes.config.modules?.["ryubing-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
      path: "product/plugins/ryubing/packages/ryubing-korri",
      capabilities: ["package.expose", "launch.runtime"],
    })
    expect(
      ryubing?.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_RYUBING_DISCOVERY_PROVIDER_ID])
  })

  it("registers Steam as a first-party app provider plugin", () => {
    const steam = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_STEAM_PLUGIN_ID,
    )

    expect(steam?.contributes.config.launchers?.steam).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      plugin: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
        },
      },
    })
    expect(steam?.contributes.config.launchers?.steam).not.toHaveProperty(
      "state",
    )
    expect(steam?.contributes.config.launchers?.steam).not.toHaveProperty(
      "extra",
    )
    expect(steam?.contributes.config.launchers?.steam).not.toHaveProperty(
      "launch-options",
    )
    expect(steam?.contributes.discovery?.map(provider => provider.id)).toEqual([
      KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID,
    ])
  })

  it("registers Box64 and 3dSen as first-party plugin infrastructure", () => {
    const box64 = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_BOX64_RUNTIME_PLUGIN_ID,
    )
    const threeDSen = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_3DSEN_PLUGIN_ID,
    )

    expect(
      box64?.contributes.config.modules?.["runtime-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "korri-box64-runtime",
    })
    expect(threeDSen?.contributes.config.launchers?.["3dsen"]).toMatchObject({
      id: KORRI_3DSEN_APP_ID,
      plugin: KORRI_3DSEN_PLUGIN_ID,
    })
  })

  it("auto-enables Box64 and Turnip when 3dSen is requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_3DSEN_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_3DSEN_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_BOX64_RUNTIME_PLUGIN_ID)).toBe(
      true,
    )
    expect(registry.enabledPluginIds.has(KORRI_TURNIP_PLUGIN_ID)).toBe(true)
    expect(registry.launchers[`${KORRI_3DSEN_PLUGIN_ID}/3dsen`]).toMatchObject({
      id: KORRI_3DSEN_APP_ID,
    })
  })

  it("exposes the 3dSen readable launch integration only when enabled", () => {
    const disabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_BOX64_RUNTIME_PLUGIN_ID,
    })
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_3DSEN_PLUGIN_ID,
    })

    expect(
      firstPartyLaunchIntegrationsForRegistry(disabled).some(
        integration => integration.providerId === KORRI_3DSEN_PLUGIN_ID,
      ),
    ).toBe(false)
    expect(
      firstPartyLaunchIntegrationsForRegistry(enabled).some(
        integration => integration.providerId === KORRI_3DSEN_PLUGIN_ID,
      ),
    ).toBe(true)
  })

  it("registers GMLoader as a first-party local payload plugin", () => {
    const gmloader = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_GMLOADER_PLUGIN_ID,
    )

    expect(
      gmloader?.contributes.config.modules?.["gmloader-next"],
    ).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#gmloader-next",
        binary: "gmloader-next",
      },
    })
  })

  it("registers Turnip as a first-party graphics runtime plugin", () => {
    const turnip = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_TURNIP_PLUGIN_ID,
    )

    expect(
      turnip?.contributes.config.modules?.["turnip-wrapper-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: KORRI_TURNIP_WRAPPER_PACKAGE,
      path: "product/plugins/turnip/packages/turnip-wrapper",
      capabilities: ["graphics.vulkan", "package.wrap", "launch.compose"],
    })
    expect(
      turnip?.contributes.config.runtimes?.["adreno-vulkan"],
    ).toMatchObject({
      kind: "graphics-driver",
      driver: "turnip",
      capabilities: ["graphics.vulkan"],
    })
  })

  it("registers ZQuest Classic as a standalone .qst runtime plugin", () => {
    const zquestClassic = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
    )

    expect(zquestClassic?.contributes.config.launchers?.zplayer).toMatchObject({
      id: KORRI_ZQUEST_CLASSIC_APP_ID,
      plugin: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
      command: "zplayer",
      args: ["-standalone", "{content.path}", "{playable.id}.sav"],
      cwd: "/storage/saves/zquest-classic",
      env: {
        ZQUEST_CLASSIC_SAVE_FOLDER: "/storage/saves/zquest-classic",
      },
      policy: { allowedCommands: ["zplayer"] },
    })
    expect(
      zquestClassic?.contributes.config.systems?.[
        KORRI_ZQUEST_CLASSIC_SYSTEM_ID
      ],
    ).toMatchObject({
      id: KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
      title: "Zelda Classic Quest",
    })
    expect(
      zquestClassic?.contributes.config.modules?.["zquest-classic-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: KORRI_ZQUEST_CLASSIC_PACKAGE,
      path: "product/plugins/zquest-classic/packages/zquest-classic",
      capabilities: ["package.expose", "launch.runtime"],
      binaries: ["zplayer", "zlauncher"],
    })
    expect(
      zquestClassic?.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_ZQUEST_CLASSIC_DISCOVERY_PROVIDER_ID])
  })

  it("exposes the ZQuest Classic readable launch integration when enabled", () => {
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
    })

    expect(
      firstPartyLaunchIntegrationsForRegistry(enabled).some(
        integration =>
          integration.kind === KORRI_ZQUEST_CLASSIC_PLUGIN_ID &&
          integration.integration === "zquest-classic",
      ),
    ).toBe(true)
  })

  it("enables RetroArch-owned ZX Spectrum, GBA, Genesis, SMS, N64, NES, PC-98, PSP, PSX, SNES, TG16, and core runtimes when requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_RETROARCH_PLUGIN_ID,
    })

    expect(registry.launchers[KORRI_RETROARCH_APP_ID]).toBeDefined()
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/zxspectrum`],
    ).toMatchObject({
      id: KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID,
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/fuse`],
    ).toMatchObject({
      id: KORRI_RETROARCH_FUSE_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/fuse_libretro.so",
      supports: { systems: [KORRI_RETROARCH_ZXSPECTRUM_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/gba`]).toMatchObject({
      id: KORRI_RETROARCH_GBA_SYSTEM_ID,
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mgba`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MGBA_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mgba_libretro.so",
      supports: { systems: [KORRI_RETROARCH_GBA_SYSTEM_ID] },
    })
    expect(registry.discoveryProviders.map(provider => provider.id)).toContain(
      KORRI_RETROARCH_GBA_DISCOVERY_PROVIDER_ID,
    )
    expect(registry.discoveryProviders).toHaveLength(11)
    expect(
      registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/genesis`],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/genesis-plus-gx`],
    ).toMatchObject({
      id: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
      supports: {
        systems: [
          KORRI_RETROARCH_GENESIS_SYSTEM_ID,
          KORRI_RETROARCH_SMS_SYSTEM_ID,
        ],
      },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/sms`]).toMatchObject({
      id: KORRI_RETROARCH_SMS_SYSTEM_ID,
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/n64`]).toMatchObject({
      id: KORRI_RETROARCH_N64_SYSTEM_ID,
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mupen64plus-next`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MUPEN64PLUS_NEXT_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mupen64plus_next_libretro.so",
      supports: { systems: [KORRI_RETROARCH_N64_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/tg16`]).toMatchObject(
      {
        id: KORRI_RETROARCH_TG16_SYSTEM_ID,
      },
    )
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
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/mesen`],
    ).toMatchObject({
      id: KORRI_RETROARCH_MESEN_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/mesen_libretro.so",
      supports: { systems: [KORRI_RETROARCH_NES_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/pc98`]).toMatchObject(
      {
        id: KORRI_RETROARCH_PC98_SYSTEM_ID,
      },
    )
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
    })
    expect(
      registry.runtimes[`${KORRI_RETROARCH_PLUGIN_ID}/pcsx-rearmed`],
    ).toMatchObject({
      id: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
      kind: "libretro-core",
      path: "/etc/korri/cores/pcsx_rearmed_libretro.so",
      supports: { systems: [KORRI_RETROARCH_PSX_SYSTEM_ID] },
    })
    expect(registry.systems[`${KORRI_RETROARCH_PLUGIN_ID}/snes`]).toMatchObject(
      {
        id: KORRI_RETROARCH_SNES_SYSTEM_ID,
      },
    )
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

    const rpcs3Enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_RPCS3_PLUGIN_ID,
    })
    expect(
      firstPartyLaunchIntegrationsForRegistry(disabled).some(
        integration => integration.kind === KORRI_RPCS3_PLUGIN_ID,
      ),
    ).toBe(false)
    expect(
      firstPartyLaunchIntegrationsForRegistry(rpcs3Enabled).some(
        integration =>
          integration.kind === KORRI_RPCS3_PLUGIN_ID &&
          integration.integration === "rpcs3",
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

    const gmloaderEnabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_GMLOADER_PLUGIN_ID,
    })
    expect(
      firstPartyLaunchIntegrationsForRegistry(disabled).some(
        integration => integration.kind === KORRI_GMLOADER_PLUGIN_ID,
      ),
    ).toBe(false)
    expect(
      firstPartyLaunchIntegrationsForRegistry(gmloaderEnabled).some(
        integration =>
          integration.kind === KORRI_GMLOADER_PLUGIN_ID &&
          integration.integration === "gmloader",
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
    expect(registry.launchers[KORRI_STEAM_APP_ID]).toBeUndefined()
    expect(registry.catalog).toEqual({})
  })

  it("enables Steam when composition explicitly opts in without auto-enabling Gamescope", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(registry.launchers[KORRI_STEAM_APP_ID]).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      plugin: KORRI_STEAM_PLUGIN_ID,
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
    expect(registry.launchers[KORRI_RYUBING_APP_ID]).toMatchObject({
      id: KORRI_RYUBING_APP_ID,
      command: "Ryujinx",
    })
    expect(registry.storage[KORRI_RYUBING_STATE_STORAGE_ID]).toMatchObject({
      root: "/var/lib/korri/ryubing",
    })
    expect(
      registry.modules[`${KORRI_RYUBING_PLUGIN_ID}/ryubing-korri-package`],
    ).toMatchObject({
      kind: "nix-package",
      package: "ryubing-korri",
    })
    expect(registry.discoveryProviders.map(provider => provider.id)).toEqual([
      KORRI_RYUBING_DISCOVERY_PROVIDER_ID,
    ])
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
    expect(registry.launchers[KORRI_RETROARCH_APP_ID]).toMatchObject({
      command: "/etc/korri/bin/retroarch",
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

  it("auto-enables RetroArch when PICO-8 discovery is requested", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_PICO8_PLUGIN_ID,
    })

    expect(registry.enabledPluginIds.has(KORRI_PICO8_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_RETROARCH_PLUGIN_ID)).toBe(true)
    expect(registry.systems[`${KORRI_PICO8_PLUGIN_ID}/pico8`]).toBeDefined()
    expect(registry.discoveryProviders.map(provider => provider.id)).toEqual([
      KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID,
    ])
    expect(registry.launchers[KORRI_RETROARCH_APP_ID]).toBeDefined()
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

  it("enables required runtime plugins through SMB Wonderland 1987 requirements", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_SMB_WONDERLAND_1987_PLUGIN_ID,
    })

    expect(
      registry.enabledPluginIds.has(KORRI_SMB_WONDERLAND_1987_PLUGIN_ID),
    ).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_FEX_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_PROTON_GE_PLUGIN_ID)).toBe(true)
    expect(
      registry.catalog[
        `${KORRI_SMB_WONDERLAND_1987_PLUGIN_ID}/smb-wonderland-1987`
      ],
    ).toMatchObject({
      title: "Super Mario Bros. Wonderland 1987",
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
