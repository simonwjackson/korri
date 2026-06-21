import { plugin } from "@platform/plugin"

export const KORRI_YFS_PLUGIN_ID = "@korri:yoshis-fabrication-station" as const
export const KORRI_YFS_LAUNCHER_LOCAL_ID = "level" as const
export const KORRI_YFS_LAUNCHER_ID =
  `${KORRI_YFS_PLUGIN_ID}/${KORRI_YFS_LAUNCHER_LOCAL_ID}` as const

export const yfsLauncherSettingDescriptors = {
  audio: { type: "enum", values: ["on", "off"] },
  gbaSounds: { type: "boolean" },
  quickDeath: { type: "boolean" },
  playTimer: { type: "boolean" },
  bgmVolume: { type: "integer", minimum: 0, maximum: 10 },
  sfxVolume: { type: "integer", minimum: 0, maximum: 10 },
  debug: { type: "boolean" },
  metrics: { type: "boolean" },
} as const

export const yoshisFabricationStationPlugin = plugin({
  namespace: "@korri",
  name: "yoshis-fabrication-station",
  title: "Yoshi's Fabrication Station",
  description:
    "Adds Yoshi's Fabrication Station as plugin-owned browser-playable content.",
  contributes: {
    config: {
      launchers: {
        [KORRI_YFS_LAUNCHER_LOCAL_ID]: {
          id: KORRI_YFS_LAUNCHER_ID,
          command: "yfs-launch",
          args: ["{content.path}"],
          settings: { plugin: {} },
          env: { KORRI_YFS_SETTINGS: "{settings.plugin}" },
          policy: {
            allowedCommands: ["yfs-launch", "chromium"],
          },
        },
      },
      catalog: {
        "yoshis-fabrication-station": {
          id: "yoshis-fabrication-station",
          title: "Yoshi's Fabrication Station",
          kind: "game",
          releases: [
            {
              id: "native-web-wrapper",
              title: "Native web wrapper package",
              launch: {
                kind: "process",
                executable: { resource: "yoshis-fabrication-station" },
              },
            },
          ],
        },
      },
      modules: {
        "yoshis-fabrication-station": {
          id: "yoshis-fabrication-station",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "korri#yoshis-fabrication-station",
            binary: "yfs",
          },
        },
        "yfs-launch": {
          id: "yfs-launch",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "korri#yoshis-fabrication-station",
            binary: "yfs-launch",
          },
        },
      },
    },
  },
})
