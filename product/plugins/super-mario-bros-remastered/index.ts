import { plugin } from "@platform/plugin"

export const superMarioBrosRemasteredPlugin = plugin({
  namespace: "@korri",
  name: "super-mario-bros-remastered",
  title: "Super Mario Bros. Remastered",
  description:
    "Adds the native Super Mario Bros. Remastered package as plugin-owned playable content.",
  contributes: {
    config: {
      catalog: {
        "super-mario-bros-remastered": {
          id: "super-mario-bros-remastered",
          title: "Super Mario Bros. Remastered",
          kind: "game",
          releases: [
            {
              id: "native",
              title: "Native package",
              launch: {
                kind: "process",
                executable: { resource: "super-mario-bros-remastered" },
              },
            },
          ],
        },
      },
      modules: {
        "super-mario-bros-remastered": {
          id: "super-mario-bros-remastered",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "korri#smb-remastered",
            binary: "smb-remastered",
          },
        },
      },
    },
  },
})
