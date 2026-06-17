import { plugin } from "@platform/plugin"

export const neverballPlugin = plugin({
  namespace: "@korri",
  name: "neverball",
  title: "Neverball",
  description: "Adds Neverball as a plugin-contributed native playable.",
  contributes: {
    config: {
      catalog: {
        neverball: {
          id: "neverball",
          title: "Neverball",
          kind: "game",
          releases: [
            {
              id: "nixpkgs",
              title: "Neverball from nixpkgs",
              launch: {
                kind: "process",
                executable: { resource: "neverball" },
              },
            },
          ],
        },
      },
      modules: {
        neverball: {
          id: "neverball",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "nixpkgs#neverball",
            binary: "neverball",
          },
        },
      },
    },
  },
})
