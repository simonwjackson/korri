#!/usr/bin/env bun
// korri-webpage — render a web page fullscreen in kiosk Chromium.
//
//   korri-webpage <url>
//
// Universal, content-agnostic: no canvas scaling, no start-gate handling. Those
// are @korri:web-canvas concerns. Settings (audio/saves/userAgent) come as JSON
// in KORRI_WEBPAGE_SETTINGS.

import { decodeWebpageSettings } from "../core/settings"
import { launchWebpage } from "./webpage"

async function main(): Promise<void> {
  const url = process.argv[2]
  if (!url) throw new Error("usage: korri-webpage <url>")
  const settings = decodeWebpageSettings(
    JSON.parse(process.env.KORRI_WEBPAGE_SETTINGS ?? "{}"),
  )
  const { proc, cdp } = await launchWebpage(url, {
    settings,
    saveId: process.env.KORRI_WEBPAGE_SAVE_ID,
  })
  cdp.close() // webpage core has nothing to drive after launch
  process.exit(await proc.exited)
}

main().catch(error => {
  console.error(`korri-webpage: ${error?.message ?? error}`)
  process.exit(1)
})
