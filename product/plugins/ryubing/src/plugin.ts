import { plugin } from "@platform/plugin"
import { releaseDiscoveryProvider } from "@platform/plugin/discovery"

export const KORRI_RYUBING_PLUGIN_ID = "@korri:ryubing" as const
export const KORRI_RYUBING_APP_LOCAL_ID = "ryubing" as const
export const KORRI_RYUBING_APP_ID =
  `${KORRI_RYUBING_PLUGIN_ID}/${KORRI_RYUBING_APP_LOCAL_ID}` as const
export const KORRI_RYUBING_SYSTEM_ID = "switch" as const
export const KORRI_RYUBING_DISCOVERY_PROVIDER_ID =
  `${KORRI_RYUBING_PLUGIN_ID}/switch-files` as const
export const KORRI_RYUBING_STATE_STORAGE_ID =
  `${KORRI_RYUBING_PLUGIN_ID}/state` as const

export const defaultRyubingPluginPolicy = {
  state: { root: `{storage:${KORRI_RYUBING_STATE_STORAGE_ID}}` },
} as const

export const ryubingSwitchDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_RYUBING_DISCOVERY_PROVIDER_ID,
  title: "Ryubing Switch game files",
  discover: ({ files }) =>
    files.flatMap(file => {
      const extension = file.extension.toLowerCase()
      if (extension !== ".nsp" && extension !== ".xci") return []
      return [
        {
          kind: "file-release" as const,
          confidence: "high" as const,
          source: file,
          release: {
            id: KORRI_RYUBING_SYSTEM_ID,
            system: KORRI_RYUBING_SYSTEM_ID,
            app: KORRI_RYUBING_APP_ID,
          },
          evidence: [{ kind: "extension", value: extension }],
        },
      ]
    }),
})

export const ryubingPlugin = plugin({
  namespace: "@korri",
  name: "ryubing",
  title: "Ryubing",
  description:
    "Adds Korri's Ryubing runtime package and Switch emulator launch integration.",
  contributes: {
    discovery: [ryubingSwitchDiscoveryProvider],
    config: {
      storage: {
        state: {
          id: KORRI_RYUBING_STATE_STORAGE_ID,
          root: "/var/lib/korri/ryubing",
        },
      },
      launchers: {
        [KORRI_RYUBING_APP_LOCAL_ID]: {
          id: KORRI_RYUBING_APP_ID,
          plugin: KORRI_RYUBING_PLUGIN_ID,
          command: "Ryujinx",
          systems: [KORRI_RYUBING_SYSTEM_ID],
          settings: { plugin: defaultRyubingPluginPolicy },
          policy: { allowedCommands: ["Ryujinx"] },
        },
      },
      systems: {
        [KORRI_RYUBING_SYSTEM_ID]: {
          id: KORRI_RYUBING_SYSTEM_ID,
          title: "Nintendo Switch",
        },
      },
      modules: {
        "ryubing-korri-package": {
          id: "ryubing-korri-package",
          kind: "nix-package",
          package: "ryubing-korri",
          path: "product/plugins/ryubing/packages/ryubing-korri",
          capabilities: ["package.expose", "launch.runtime"],
          binaries: ["Ryujinx"],
        },
      },
    },
  },
})
