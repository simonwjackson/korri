import { plugin } from "@platform/plugin"
import { rpcs3Ps3DiscFolderDiscoveryProvider } from "./discovery"
import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_APP_LOCAL_ID,
  KORRI_RPCS3_DEFAULT_COMMAND,
  KORRI_RPCS3_DEFAULT_GAMES_ROOT,
  KORRI_RPCS3_DEFAULT_STATE_ROOT,
  KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  KORRI_RPCS3_RUNTIME_LOCAL_ID,
  KORRI_RPCS3_STATE_STORAGE_ID,
  KORRI_RPCS3_STATE_STORAGE_LOCAL_ID,
} from "./ids"

export {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_APP_LOCAL_ID,
  KORRI_RPCS3_DEFAULT_COMMAND,
  KORRI_RPCS3_DEFAULT_GAMES_ROOT,
  KORRI_RPCS3_DEFAULT_STATE_ROOT,
  KORRI_RPCS3_GAMES_STORAGE_ID,
  KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  KORRI_RPCS3_RUNTIME_LOCAL_ID,
  KORRI_RPCS3_STATE_STORAGE_ID,
  KORRI_RPCS3_STATE_STORAGE_LOCAL_ID,
} from "./ids"

export const rpcs3Plugin = plugin({
  namespace: "@korri",
  name: "rpcs3",
  title: "RPCS3",
  description:
    "Owns Korri's first-party Sony PlayStation 3 discovery and RPCS3 launch boundary.",
  contributes: {
    discovery: [rpcs3Ps3DiscFolderDiscoveryProvider],
    config: {
      storage: {
        [KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID]: {
          id: KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID,
          root: KORRI_RPCS3_DEFAULT_GAMES_ROOT,
        },
        [KORRI_RPCS3_STATE_STORAGE_LOCAL_ID]: {
          id: KORRI_RPCS3_STATE_STORAGE_LOCAL_ID,
          root: KORRI_RPCS3_DEFAULT_STATE_ROOT,
        },
      },
      systems: {
        [KORRI_RPCS3_PS3_SYSTEM_ID]: {
          id: KORRI_RPCS3_PS3_SYSTEM_ID,
          title: "Sony PlayStation 3",
        },
      },
      runtimes: {
        [KORRI_RPCS3_RUNTIME_LOCAL_ID]: {
          id: KORRI_RPCS3_RUNTIME_ID,
          kind: "emulator",
          app: KORRI_RPCS3_APP_ID,
          path: KORRI_RPCS3_DEFAULT_COMMAND,
          supports: { systems: [KORRI_RPCS3_PS3_SYSTEM_ID] },
        },
      },
      launchers: {
        [KORRI_RPCS3_APP_LOCAL_ID]: {
          id: KORRI_RPCS3_APP_ID,
          plugin: KORRI_RPCS3_PLUGIN_ID,
          command: KORRI_RPCS3_DEFAULT_COMMAND,
          args: ["--no-gui", "{content.path}"],
          systems: [KORRI_RPCS3_PS3_SYSTEM_ID],
          settings: {
            plugin: {
              command: "",
              state: { root: `{storage:${KORRI_RPCS3_STATE_STORAGE_ID}}` },
            },
          },
          policy: { allowedCommands: [KORRI_RPCS3_DEFAULT_COMMAND] },
        },
      },
    },
  },
})
