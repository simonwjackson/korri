import { plugin } from "@platform/plugin"

export const KORRI_GAMESCOPE_PLUGIN_ID = "@korri:gamescope" as const

export const gamescopePlugin = plugin({
  namespace: "@korri",
  name: "gamescope",
  title: "Gamescope",
  description: "Declares Gamescope as Korri's first-party launch companion.",
  contributes: {
    launchCompanions: [
      {
        id: KORRI_GAMESCOPE_PLUGIN_ID,
        role: "launch-wrapper",
        supports: { systems: ["*"] },
      },
    ],
  },
})
