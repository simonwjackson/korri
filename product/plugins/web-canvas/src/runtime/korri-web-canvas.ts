#!/usr/bin/env bun
// korri-web-canvas — a single-canvas web game, fullscreen.
//
//   korri-web-canvas <url>
//
// Composes the webpage core (kiosk Chromium launch) and layers canvas
// presentation (background + fit + scaling + rotate), an optional render-res
// override, and the universal start-gate click. Canvas settings come as JSON in
// KORRI_WEB_CANVAS_SETTINGS; webpage settings in KORRI_WEBPAGE_SETTINGS.

import { decodeWebpageSettings } from "../../../webpage/src/core/settings"
import { launchWebpage } from "../../../webpage/src/runtime/webpage"
import { applyCanvasConcerns } from "../canvas"
import { decodeCanvasSettings } from "../settings"

async function main(): Promise<void> {
  const url = process.argv[2]
  if (!url) throw new Error("usage: korri-web-canvas <url>")
  const canvasSettings = decodeCanvasSettings(
    JSON.parse(process.env.KORRI_WEB_CANVAS_SETTINGS ?? "{}"),
  )
  const webpageSettings = decodeWebpageSettings(
    JSON.parse(process.env.KORRI_WEBPAGE_SETTINGS ?? "{}"),
  )
  const { proc, cdp } = await launchWebpage(url, {
    settings: webpageSettings,
    saveId: process.env.KORRI_WEBPAGE_SAVE_ID,
    // prevent a white flash before the presentation shim paints the background
    extraFlags: ["--default-background-color=ff000000"],
  })
  await applyCanvasConcerns(cdp, canvasSettings)
  cdp.close()
  process.exit(await proc.exited)
}

main().catch(error => {
  console.error(`korri-web-canvas: ${error?.message ?? error}`)
  process.exit(1)
})
