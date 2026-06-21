import { plugin } from "@platform/plugin"

export const KORRI_WEB_RUNTIME_PLUGIN_ID = "@korri:web-runtime" as const
export const KORRI_WEB_RUNTIME_LAUNCHER_LOCAL_ID = "chromium" as const
export const KORRI_WEB_RUNTIME_LAUNCHER_ID =
  `${KORRI_WEB_RUNTIME_PLUGIN_ID}/${KORRI_WEB_RUNTIME_LAUNCHER_LOCAL_ID}` as const

// @korri:web-runtime — runs HTML5/canvas web games in bare kiosk Chromium.
//
// First-class launcher: the only input is the release's url `target`. Scaling
// happens in-page (the canvas fits the fullscreen surface) and the start gate is
// cleared with one universal trusted click, so there is no per-game / per-engine
// configuration. gamescope is NOT part of this plugin; if a composition wants it,
// it wraps this launch from outside (and swaps the Chromium ozone platform to x11).
export const webRuntimePlugin = plugin({
  namespace: "@korri",
  name: "web-runtime",
  title: "Web Runtime (Chromium)",
  description:
    "Runs HTML5/canvas web games in bare kiosk Chromium; in-page scaling and a " +
    "universal start-gate click mean a web game is just a url target.",
  contributes: {
    config: {
      launchers: {
        [KORRI_WEB_RUNTIME_LAUNCHER_LOCAL_ID]: {
          id: KORRI_WEB_RUNTIME_LAUNCHER_ID,
          plugin: KORRI_WEB_RUNTIME_PLUGIN_ID,
          command: "korri-web-runtime",
          // `{target}` resolves to a url target's value (the playable URL).
          args: ["{target}"],
          settings: { plugin: {} },
          policy: { allowedCommands: ["korri-web-runtime", "chromium"] },
        },
      },
      modules: {
        "korri-web-runtime-package": {
          id: "korri-web-runtime-package",
          kind: "nix-package",
          package: "korri-web-runtime",
          path: "product/plugins/web-runtime/packages/korri-web-runtime",
          capabilities: ["package.expose"],
        },
      },
    },
  },
})
