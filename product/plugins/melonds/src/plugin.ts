import { plugin } from "@platform/plugin"
import { melonDsNdsDiscoveryProvider } from "./discovery"
import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_APP_LOCAL_ID,
  KORRI_MELONDS_DEFAULT_COMMAND,
  KORRI_MELONDS_DEFAULT_STATE_ROOT,
  KORRI_MELONDS_NDS_SYSTEM_ID,
  KORRI_MELONDS_NIX_PACKAGE,
  KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID,
  KORRI_MELONDS_PLUGIN_ID,
  KORRI_MELONDS_STATE_STORAGE_ID,
  KORRI_MELONDS_STATE_STORAGE_LOCAL_ID,
} from "./ids"

export {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_APP_LOCAL_ID,
  KORRI_MELONDS_DEFAULT_COMMAND,
  KORRI_MELONDS_DEFAULT_STATE_ROOT,
  KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
  KORRI_MELONDS_NDS_SYSTEM_ID,
  KORRI_MELONDS_NIX_PACKAGE,
  KORRI_MELONDS_PACKAGE_MODULE_ID,
  KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID,
  KORRI_MELONDS_PLUGIN_ID,
  KORRI_MELONDS_STATE_STORAGE_ID,
  KORRI_MELONDS_STATE_STORAGE_LOCAL_ID,
} from "./ids"

export const melonDsPlugin = plugin({
  namespace: "@korri",
  name: "melonds",
  title: "melonDS",
  description:
    "Owns Korri's first-party Nintendo DS discovery and standalone melonDS launch boundary.",
  contributes: {
    discovery: [melonDsNdsDiscoveryProvider],
    config: {
      storage: {
        [KORRI_MELONDS_STATE_STORAGE_LOCAL_ID]: {
          id: KORRI_MELONDS_STATE_STORAGE_LOCAL_ID,
          root: KORRI_MELONDS_DEFAULT_STATE_ROOT,
        },
      },
      systems: {
        [KORRI_MELONDS_NDS_SYSTEM_ID]: {
          id: KORRI_MELONDS_NDS_SYSTEM_ID,
          title: "Nintendo DS",
        },
      },
      launchers: {
        [KORRI_MELONDS_APP_LOCAL_ID]: {
          id: KORRI_MELONDS_APP_ID,
          plugin: KORRI_MELONDS_PLUGIN_ID,
          command: KORRI_MELONDS_DEFAULT_COMMAND,
          args: ["{content.path}"],
          systems: [KORRI_MELONDS_NDS_SYSTEM_ID],
          settings: {
            plugin: {
              state: { root: `{storage:${KORRI_MELONDS_STATE_STORAGE_ID}}` },
              boot: { direct: true },
              display: { mode: "vertical" },
            },
          },
          policy: { allowedCommands: [KORRI_MELONDS_DEFAULT_COMMAND] },
        },
      },
      modules: {
        [KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID]: {
          id: KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID,
          kind: "nix-package",
          package: KORRI_MELONDS_NIX_PACKAGE,
          path: "nixpkgs#melonDS",
          capabilities: ["package.expose", "launch.runtime"],
          binaries: ["melonDS"],
        },
      },
    },
  },
})
