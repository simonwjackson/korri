import { plugin } from "@platform/plugin"

export const neverballPlugin = plugin({
  namespace: "@korri",
  name: "neverball",
  title: "Neverball",
  description: "Adds Neverball as a plugin-contributed native playable.",
  contributes: {
    catalog: [
      {
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
    ],
    resources: [
      {
        id: "neverball",
        kind: "executable",
        fulfill: {
          provider: "nix",
          installable: "nixpkgs#neverball",
          binary: "neverball",
        },
      },
    ],
  },
})
