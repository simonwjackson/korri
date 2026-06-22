import { plugin } from "@platform/plugin"
import { KORRI_REMAP_PLUGIN_ID } from "../remap"

export const KORRI_YFS_PLUGIN_ID = "@korri:yoshis-fabrication-station" as const
const KORRI_YFS_LAUNCHER_LOCAL_ID = "level" as const
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
  viewport: {
    type: "object",
    properties: {
      width: { type: "integer", minimum: 1, maximum: 8192 },
      height: { type: "integer", minimum: 1, maximum: 8192 },
      aspect: { type: "string" },
      policy: { type: "enum", values: ["expand-only"] },
    },
  },
  zoom: {
    type: "object",
    properties: {
      mode: { type: "enum", values: ["auto-area", "fixed"] },
      scale: { type: "number", minimum: 0.001, maximum: 16 },
      multiplier: { type: "number", minimum: 0.001, maximum: 16 },
    },
  },
} as const

export const yoshisFabricationStationPlugin = plugin({
  namespace: "@korri",
  name: "yoshis-fabrication-station",
  title: "Yoshi's Fabrication Station",
  description:
    "Adds Yoshi's Fabrication Station as plugin-owned browser-playable content.",
  requires: [
    {
      capability: "input.remap",
      ref: { provider: KORRI_REMAP_PLUGIN_ID, id: "self" },
      reason:
        "YFS needs launch-scoped controller-to-keyboard input via Remap.",
    },
  ],
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
                with: {
                  [KORRI_REMAP_PLUGIN_ID]: {
                    controllers: {
                      p1: {
                        source: "inputplumber",
                        names: ["Microsoft Xbox Series S|X Controller"],
                      },
                    },
                    bindings: {
                      "p1.dpad.up": "key.up",
                      "p1.dpad.down": "key.down",
                      "p1.dpad.left": "key.left",
                      "p1.dpad.right": "key.right",
                      "p1.button.south": "key.z",
                      "p1.button.west": "key.a",
                      "p1.button.east": "key.x",
                      "p1.button.north": "key.s",
                      "p1.button.start": "key.p",
                      "p1.button.select": "key.q",
                    },
                  },
                },
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
