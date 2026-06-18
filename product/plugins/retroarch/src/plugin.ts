import { plugin } from "@platform/plugin"

export const KORRI_RETROARCH_PLUGIN_ID = "@korri:retroarch" as const
export const KORRI_RETROARCH_APP_LOCAL_ID = "retroarch" as const
export const KORRI_RETROARCH_APP_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_APP_LOCAL_ID}` as const

export const retroarchPlugin = plugin({
  namespace: "@korri",
  name: "retroarch",
  title: "RetroArch",
  description:
    "Owns the RetroArch app/runtime host integration for libretro core launches.",
  contributes: {
    config: {
      apps: {
        [KORRI_RETROARCH_APP_LOCAL_ID]: {
          id: KORRI_RETROARCH_APP_ID,
          kind: KORRI_RETROARCH_PLUGIN_ID,
          command: "retroarch",
          args: [
            "--config",
            "{configPath}",
            "-L",
            "{runtime.path}",
            "{content.path}",
          ],
          plugin: {
            [KORRI_RETROARCH_PLUGIN_ID]: {},
          },
          policy: { allowedCommands: ["retroarch"] },
        },
      },
    },
  },
})
