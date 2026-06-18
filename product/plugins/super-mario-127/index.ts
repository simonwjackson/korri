import { plugin } from "@platform/plugin"

export const superMario127Plugin = plugin({
  namespace: "@korri",
  name: "super-mario-127",
  title: "Super Mario 127",
  description:
    "Adds the native Super Mario 127 package as plugin-owned playable content.",
  contributes: {
    config: {
      catalog: {
        "super-mario-127": {
          id: "super-mario-127",
          title: "Super Mario 127",
          kind: "game",
          releases: [
            {
              id: "native",
              title: "Native package",
              launch: {
                kind: "process",
                executable: { resource: "super-mario-127" },
              },
            },
          ],
        },
      },
      modules: {
        "super-mario-127": {
          id: "super-mario-127",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "korri#super-mario-127",
            binary: "super-mario-127",
          },
        },
      },
    },
  },
})
