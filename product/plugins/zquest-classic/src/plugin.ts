import { plugin } from "@platform/plugin"

export const KORRI_ZQUEST_CLASSIC_PLUGIN_ID = "@korri:zquest-classic" as const
export const KORRI_ZQUEST_CLASSIC_APP_LOCAL_ID = "zplayer" as const
export const KORRI_ZQUEST_CLASSIC_APP_ID =
  `${KORRI_ZQUEST_CLASSIC_PLUGIN_ID}/${KORRI_ZQUEST_CLASSIC_APP_LOCAL_ID}` as const
export const KORRI_ZQUEST_CLASSIC_SYSTEM_ID = "zelda-classic" as const
export const KORRI_ZQUEST_CLASSIC_PACKAGE = "zquest-classic" as const

export const zquestClassicPlugin = plugin({
  namespace: "@korri",
  name: "zquest-classic",
  title: "ZQuest Classic",
  description:
    "Adds the ZQuest Classic standalone player for Zelda Classic .qst quests.",
  contributes: {
    config: {
      launchers: {
        [KORRI_ZQUEST_CLASSIC_APP_LOCAL_ID]: {
          id: KORRI_ZQUEST_CLASSIC_APP_ID,
          plugin: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
          command: "zplayer",
          args: ["-standalone", "{content.path}", "{playable.id}.sav"],
          systems: [KORRI_ZQUEST_CLASSIC_SYSTEM_ID],
          cwd: "/storage/saves/zquest-classic",
          env: {
            ZQUEST_CLASSIC_SAVE_FOLDER: "/storage/saves/zquest-classic",
          },
          policy: { allowedCommands: ["zplayer"] },
        },
      },
      systems: {
        [KORRI_ZQUEST_CLASSIC_SYSTEM_ID]: {
          id: KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
          title: "Zelda Classic Quest",
        },
      },
      modules: {
        "zquest-classic-package": {
          id: "zquest-classic-package",
          kind: "nix-package",
          package: KORRI_ZQUEST_CLASSIC_PACKAGE,
          path: "product/plugins/zquest-classic/packages/zquest-classic",
          capabilities: ["package.expose", "launch.runtime"],
          binaries: ["zplayer", "zlauncher"],
        },
      },
    },
  },
})
