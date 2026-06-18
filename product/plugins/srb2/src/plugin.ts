import { plugin } from "@platform/plugin"

export const KORRI_SRB2_PLUGIN_ID = "@korri:srb2" as const

export const srb2Plugin = plugin({
  namespace: "@korri",
  name: "srb2",
  title: "Sonic Robo Blast 2",
  description:
    "Adds Sonic Robo Blast 2 as a first-party native playable backed by nixpkgs' SRB2 package.",
  contributes: {
    config: {
      catalog: {
        srb2: {
          id: "srb2",
          title: "Sonic Robo Blast 2",
          kind: "game",
          releases: [
            {
              id: "nixpkgs-2.2.15",
              title: "Sonic Robo Blast 2 2.2.15 from nixpkgs",
              launch: {
                kind: "process",
                executable: { resource: "srb2" },
              },
            },
          ],
        },
      },
      modules: {
        srb2: {
          id: "srb2",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: ".#srb2",
            binary: "srb2",
          },
        },
      },
    },
  },
})
