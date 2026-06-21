#!/usr/bin/env bun

import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  applyCanvasConcerns,
  prepareCanvasStartupScripts,
} from "../../../web-canvas/src/canvas"
import type { CanvasSettings } from "../../../web-canvas/src/settings"
import type { WebpageSettings } from "../../../webpage/src/core/settings"
import { launchWebpage } from "../../../webpage/src/runtime/webpage"
import { prepareYfsLaunchRoot } from "./cache"
import { waitForYfsReady } from "./diagnostics"
import {
  normalizeYfsLauncherSettings,
  parseYfsSettingsJson,
  type YfsLauncherSettings,
  yfsSettingsQuery,
} from "./settings-runtime"

const LAUNCHER_VERSION = "1"

export interface ParsedYfsLaunchCli {
  readonly levelFile: string
  readonly settings: YfsLauncherSettings
}

const scriptDir = dirname(fileURLToPath(import.meta.url))

export function yfsShimPaths(): string[] {
  const shimDir =
    process.env.KORRI_YFS_SHIM_DIR ?? join(scriptDir, "../../scripts")
  return [
    join(shimDir, "yfs-launch-settings.js"),
    join(shimDir, "yfs-level-loader.js"),
  ]
}

function usage(): string {
  return "usage: yfs-launch <level-file>"
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function parseVolume(value: string, flag: string): number {
  if (!/^(?:[0-9]|10)$/.test(value))
    throw new Error(`${flag} expects integer 0..10, got: ${value}`)
  return Number(value)
}

export function parseYfsLaunchCli(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): ParsedYfsLaunchCli {
  const settings: Record<string, unknown> = {
    ...parseYfsSettingsJson(env.KORRI_YFS_SETTINGS),
  }
  let levelFile: string | undefined
  const args = [...argv]
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "-h" || arg === "--help") throw new Error(usage())
    if (arg === "--audio") settings.audio = "on"
    else if (arg === "--no-audio") settings.audio = "off"
    else if (arg.startsWith("--audio=")) {
      const value = arg.slice("--audio=".length)
      if (value !== "on" && value !== "off")
        throw new Error(`--audio expects on|off, got: ${value}`)
      settings.audio = value
    } else if (arg === "--gba-sounds") settings.gbaSounds = true
    else if (arg === "--no-gba-sounds") settings.gbaSounds = false
    else if (arg === "--quick-death") settings.quickDeath = true
    else if (arg === "--no-quick-death") settings.quickDeath = false
    else if (arg === "--play-timer") settings.playTimer = true
    else if (arg === "--no-play-timer") settings.playTimer = false
    else if (arg === "--metrics") settings.metrics = true
    else if (arg === "--debug") settings.debug = true
    else if (arg === "--bgm-volume") {
      settings.bgmVolume = parseVolume(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--bgm-volume=")) {
      settings.bgmVolume = parseVolume(
        arg.slice("--bgm-volume=".length),
        "--bgm-volume",
      )
    } else if (arg === "--sfx-volume") {
      settings.sfxVolume = parseVolume(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--sfx-volume=")) {
      settings.sfxVolume = parseVolume(
        arg.slice("--sfx-volume=".length),
        "--sfx-volume",
      )
    } else if (arg.startsWith("-")) throw new Error(`unknown flag: ${arg}`)
    else if (!levelFile) levelFile = arg
    else throw new Error(`unexpected extra argument: ${arg}`)
  }
  if (!levelFile) throw new Error(usage())
  return { levelFile, settings: normalizeYfsLauncherSettings(settings) }
}

export function buildYfsLaunchUrl(
  preparedRoot: string,
  settings: YfsLauncherSettings,
): string {
  const params = yfsSettingsQuery(settings)
  params.set("code_url", "level.json")
  const base = pathToFileURL(join(preparedRoot, "index.html")).toString()
  return `${base}?${params.toString()}`
}

export async function terminateBrowserForFailedLaunch(
  proc: Bun.Subprocess,
  timeoutMs = 2000,
): Promise<void> {
  proc.kill("SIGTERM")
  const exited = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(timeoutMs).then(() => false),
  ])
  if (!exited) {
    proc.kill("SIGKILL")
    await proc.exited
  }
}

async function waitForYfsReadyOrBrowserExit(
  cdp: Parameters<typeof waitForYfsReady>[0],
  proc: Bun.Subprocess,
): Promise<void> {
  await Promise.race([
    waitForYfsReady(cdp).then(() => undefined),
    proc.exited.then(code => {
      throw new Error(`Chromium exited before YFS loader became ready: ${code}`)
    }),
  ])
}

interface CanvasRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

async function waitForCanvasRect(
  cdp: Parameters<typeof waitForYfsReady>[0],
  timeoutMs = 12000,
): Promise<CanvasRect> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rect = await cdp.evaluate<CanvasRect | null>(
      `(() => {
        const canvas = document.querySelector("canvas")
        if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      })()`,
    )
    if (rect) return rect
    await Bun.sleep(100)
  }
  throw new Error("Timed out waiting for YFS canvas")
}

async function clickCanvasPoint(
  cdp: Parameters<typeof waitForYfsReady>[0],
  rect: CanvasRect,
  fractionX: number,
  fractionY: number,
): Promise<void> {
  const x = rect.left + rect.width * fractionX
  const y = rect.top + rect.height * fractionY
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  })
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  })
}

async function hasVisibleYfsLevelInput(
  cdp: Parameters<typeof waitForYfsReady>[0],
): Promise<boolean> {
  return await cdp.evaluate<boolean>(
    `(() => {
      const candidates = [...document.querySelectorAll("textarea, input:not([type='hidden'])")]
      return candidates.some(element => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 40 && rect.height > 10 && style.visibility !== "hidden" && style.display !== "none"
      })
    })()`,
  )
}

async function openYfsLoadUi(
  cdp: Parameters<typeof waitForYfsReady>[0],
): Promise<void> {
  const rect = await waitForCanvasRect(cdp)
  const deadline = Date.now() + 18000
  // YFS boots to its title screen. A normal launcher must still advance to the
  // built-in Play Level screen before the level-code loader can inject content.
  // The title screen becomes interactive after Construct's boot animation, so
  // retry the trusted click until the visible level-code input appears.
  while (Date.now() < deadline) {
    if (await hasVisibleYfsLevelInput(cdp)) return
    for (const [x, y] of [
      [0.5, 0.88],
      [0.5, 0.9],
      [0.5, 0.92],
    ] as const) {
      await clickCanvasPoint(cdp, rect, x, y)
      await Bun.sleep(120)
    }
    await Bun.sleep(500)
  }
}

export interface RunYfsLaunchOptions {
  readonly argv: readonly string[]
  readonly env?: Record<string, string | undefined>
}

export async function runYfsLaunch(
  options: RunYfsLaunchOptions,
): Promise<number> {
  const env = options.env ?? process.env
  const parsed = parseYfsLaunchCli(options.argv, env)
  const webroot = env.KORRI_YFS_WEBROOT
  if (!webroot) throw new Error("KORRI_YFS_WEBROOT is required")
  const prepared = await prepareYfsLaunchRoot({
    webroot,
    levelFile: parsed.levelFile,
    settings: parsed.settings,
    launcherVersion: LAUNCHER_VERSION,
  })
  const targetUrl = buildYfsLaunchUrl(prepared.root, parsed.settings)
  const canvasSettings: CanvasSettings = {
    gate: "none",
    shim: yfsShimPaths(),
  }
  const webpageSettings: WebpageSettings = { audio: "on", saves: "ephemeral" }
  const startupScripts = await prepareCanvasStartupScripts(canvasSettings)
  const { proc, cdp } = await launchWebpage(targetUrl, {
    settings: webpageSettings,
    preNavigationScripts: startupScripts.map(script => script.source),
    saveId: `yfs-${prepared.cacheKey}`,
    extraFlags: [
      "--default-background-color=ff000000",
      "--allow-file-access-from-files",
    ],
  })
  try {
    await applyCanvasConcerns(cdp, canvasSettings, startupScripts)
    await openYfsLoadUi(cdp)
    await waitForYfsReadyOrBrowserExit(cdp, proc)
    cdp.close()
    return await proc.exited
  } catch (error) {
    cdp.close()
    await terminateBrowserForFailedLaunch(proc)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `yfs-launch failed for prepared root ${prepared.root} (${prepared.cacheKey}): ${message}`,
    )
  }
}

if (import.meta.main) {
  runYfsLaunch({ argv: process.argv.slice(2) })
    .then(code => {
      process.exitCode = code
    })
    .catch(error => {
      console.error(
        `yfs-launch: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(1)
    })
}
