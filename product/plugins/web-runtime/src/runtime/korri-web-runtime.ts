#!/usr/bin/env bun
// korri-web-runtime — runs an HTML5/canvas web game in Chromium under gamescope.
//
//   korri-web-runtime <url|file://…> [--engine X] [--native detect|WxH]
//     [--output WxH] [--gap WxH] [--filter pixel|linear] [--flag F]*
//     [--shim PATH]* [--no-gamescope] [--autoplay default]
//
// Chromium + gamescope binaries come from KORRI_WEB_RUNTIME_CHROMIUM /
// KORRI_WEB_RUNTIME_GAMESCOPE (the Nix wrapper sets these).

import { parseRunConfig } from "./args"
import { run } from "./run"

async function main(): Promise<void> {
  const config = parseRunConfig(process.argv.slice(2))
  const code = await run(config)
  process.exit(code)
}

main().catch(error => {
  console.error(`korri-web-runtime: ${error?.message ?? error}`)
  process.exit(1)
})
