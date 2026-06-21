import { plugin } from "@platform/plugin"
import { KORRI_WEBPAGE_PLUGIN_ID } from "../webpage"

export const KORRI_WEB_CANVAS_PLUGIN_ID = "@korri:web-canvas" as const
export const KORRI_WEB_CANVAS_LAUNCHER_LOCAL_ID = "chromium" as const
export const KORRI_WEB_CANVAS_LAUNCHER_ID =
  `${KORRI_WEB_CANVAS_PLUGIN_ID}/${KORRI_WEB_CANVAS_LAUNCHER_LOCAL_ID}` as const

// @korri:web-canvas — single-canvas web games. Composes @korri:webpage (kiosk
// Chromium) and sprinkles the canvas-specific behavior: letterbox background,
// auto-fit/scale/center the canvas, optional render-resolution override, and the
// universal start-gate click. Authoring a canvas game is just a url target.
export const webCanvasPlugin = plugin({
  namespace: "@korri",
  name: "web-canvas",
  title: "Web Canvas Game (Chromium)",
  description:
    "Runs single-canvas HTML5 games fullscreen. Composes @korri:webpage and adds " +
    "canvas scaling, letterbox, render-res override, and start-gate handling.",
  requires: [
    {
      capability: "package.expose",
      ref: { provider: KORRI_WEBPAGE_PLUGIN_ID, id: "korri-webpage-package" },
      reason: "web-canvas composes the webpage core launch.",
    },
  ],
  contributes: {
    config: {
      launchers: {
        [KORRI_WEB_CANVAS_LAUNCHER_LOCAL_ID]: {
          id: KORRI_WEB_CANVAS_LAUNCHER_ID,
          command: "korri-web-canvas",
          args: ["{target}"],
          settings: { plugin: {} },
          env: { KORRI_WEB_CANVAS_SETTINGS: "{settings.plugin}" },
          policy: {
            allowedCommands: ["korri-web-canvas", "korri-webpage", "chromium"],
          },
        },
      },
      modules: {
        "korri-web-canvas-package": {
          id: "korri-web-canvas-package",
          kind: "nix-package",
          package: "korri-web-canvas",
          path: "product/plugins/web-canvas/packages/korri-web-canvas",
          capabilities: ["package.expose"],
        },
      },
    },
  },
})
