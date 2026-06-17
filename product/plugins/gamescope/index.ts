import { plugin } from "@platform/plugin"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@platform/plugin/ids"

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
