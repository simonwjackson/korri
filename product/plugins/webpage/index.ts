import { plugin } from "@platform/plugin"

export const KORRI_WEBPAGE_PLUGIN_ID = "@korri:webpage" as const
export const KORRI_WEBPAGE_LAUNCHER_LOCAL_ID = "chromium" as const
export const KORRI_WEBPAGE_LAUNCHER_ID =
  `${KORRI_WEBPAGE_PLUGIN_ID}/${KORRI_WEBPAGE_LAUNCHER_LOCAL_ID}` as const

// @korri:webpage — renders any web page fullscreen in kiosk Chromium.
//
// Deliberately content-agnostic: no canvas scaling, no letterbox background, no
// start-gate handling. Useful on its own (kiosk web apps, tools, DOM games) and
// the base that @korri:web-canvas composes for single-canvas games.
export const webpagePlugin = plugin({
  namespace: "@korri",
  name: "webpage",
  title: "Webpage (Chromium)",
  description:
    "Renders a web page fullscreen in kiosk Chromium. Content-agnostic base for " +
    "web apps, tools, and (via @korri:web-canvas) canvas games.",
  contributes: {
    config: {
      launchers: {
        [KORRI_WEBPAGE_LAUNCHER_LOCAL_ID]: {
          id: KORRI_WEBPAGE_LAUNCHER_ID,
          command: "korri-webpage",
          args: ["{target}"],
          settings: { plugin: {} },
          env: { KORRI_WEBPAGE_SETTINGS: "{settings.plugin}" },
          policy: { allowedCommands: ["korri-webpage", "chromium"] },
        },
      },
      modules: {
        "korri-webpage-package": {
          id: "korri-webpage-package",
          kind: "nix-package",
          package: "korri-webpage",
          path: "product/plugins/webpage/packages/korri-webpage",
          capabilities: ["package.expose"],
        },
      },
    },
  },
})
