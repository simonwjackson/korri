import { plugin } from "@platform/plugin"

export const yoshisFabricationStationPlugin = plugin({
  namespace: "@korri",
  name: "yoshis-fabrication-station",
  title: "Yoshi's Fabrication Station",
  description:
    "Adds Yoshi's Fabrication Station as plugin-owned browser-playable content.",
  contributes: {
    config: {
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
      },
    },
  },
})
