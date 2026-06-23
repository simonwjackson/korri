#!/usr/bin/env bun
// korri-web-canvas — a single-canvas web game, fullscreen.
//
//   korri-web-canvas <url>
//
// Composes the webpage core (kiosk Chromium launch) and layers canvas
// presentation (background + fit + scaling + rotate), an optional render-res
// override, and the universal start-gate click. Canvas settings come as JSON in
// KORRI_WEB_CANVAS_SETTINGS; webpage settings in KORRI_WEBPAGE_SETTINGS.

import type { WebpageSettings } from "../../../webpage/src/core/settings"
import { launchWebpage } from "../../../webpage/src/runtime/webpage"
import { applyCanvasConcerns, prepareCanvasStartupScripts } from "../canvas"
import type { CanvasSettings } from "../settings"

interface WebCanvasCli {
  readonly url: string
  readonly canvasSettings: CanvasSettings
  readonly webpageSettings: WebpageSettings
  readonly chromiumPath?: string
  readonly browserEnv: Record<string, string>
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function parseJsonFlag<T>(value: string, flag: string): T {
  try {
    return JSON.parse(value) as T
  } catch (error) {
    throw new Error(
      `${flag} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function parseBrowserEnv(value: string): readonly [string, string] {
  const separator = value.indexOf("=")
  if (separator <= 0) throw new Error("--browser-env expects KEY=VALUE")
  return [value.slice(0, separator), value.slice(separator + 1)]
}

function parseCli(argv: readonly string[]): WebCanvasCli {
  let url: string | undefined
  let chromiumPath: string | undefined
  const browserEnv: Record<string, string> = {}
  let canvasSettings = parseJsonFlag<CanvasSettings>(
    process.env.KORRI_WEB_CANVAS_SETTINGS ?? "{}",
    "KORRI_WEB_CANVAS_SETTINGS",
  )
  let webpageSettings = parseJsonFlag<WebpageSettings>(
    process.env.KORRI_WEBPAGE_SETTINGS ?? "{}",
    "KORRI_WEBPAGE_SETTINGS",
  )

  const args = [...argv]
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--settings-json") {
      canvasSettings = parseJsonFlag(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--settings-json=")) {
      canvasSettings = parseJsonFlag(
        arg.slice("--settings-json=".length),
        "--settings-json",
      )
    } else if (arg === "--webpage-settings-json") {
      webpageSettings = parseJsonFlag(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--webpage-settings-json=")) {
      webpageSettings = parseJsonFlag(
        arg.slice("--webpage-settings-json=".length),
        "--webpage-settings-json",
      )
    } else if (arg === "--chromium") {
      chromiumPath = readValue(args, index, arg)
      index += 1
    } else if (arg.startsWith("--chromium=")) {
      chromiumPath = arg.slice("--chromium=".length)
    } else if (arg === "--browser-env") {
      const [key, value] = parseBrowserEnv(readValue(args, index, arg))
      browserEnv[key] = value
      index += 1
    } else if (arg.startsWith("--browser-env=")) {
      const [key, value] = parseBrowserEnv(arg.slice("--browser-env=".length))
      browserEnv[key] = value
    } else if (arg.startsWith("-")) throw new Error(`unknown flag: ${arg}`)
    else if (!url) url = arg
    else throw new Error(`unexpected extra argument: ${arg}`)
  }

  if (!url) throw new Error("usage: korri-web-canvas [options] <url>")
  return { url, canvasSettings, webpageSettings, chromiumPath, browserEnv }
}

async function main(): Promise<void> {
  const { url, canvasSettings, webpageSettings, chromiumPath, browserEnv } =
    parseCli(process.argv.slice(2))
  // Settings are validated at config time by the plugins' schemas; the runtime
  // stays dependency-light and just reads the already-validated JSON.
  const privateExtraFlags = parseJsonFlag<string[]>(
    process.env.KORRI_WEBPAGE_EXTRA_FLAGS ?? "[]",
    "KORRI_WEBPAGE_EXTRA_FLAGS",
  )
  const startupScripts = await prepareCanvasStartupScripts(canvasSettings)
  const { proc, cdp, disposeSignalHandlers } = await launchWebpage(url, {
    settings: webpageSettings,
    chromiumPath,
    env: browserEnv,
    saveId: process.env.KORRI_WEBPAGE_SAVE_ID,
    preNavigationScripts: startupScripts.map(script => script.source),
    // prevent a white flash before the presentation shim paints the background
    extraFlags: ["--default-background-color=ff000000", ...privateExtraFlags],
  })
  await applyCanvasConcerns(cdp, canvasSettings, startupScripts)
  cdp.close()
  const exitCode = await proc.exited
  disposeSignalHandlers()
  process.exit(exitCode)
}

main().catch(error => {
  console.error(`korri-web-canvas: ${error?.message ?? error}`)
  process.exit(1)
})
