#!/usr/bin/env bun

import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { prepareCanvasStartupScripts } from "../../../web-canvas/src/canvas"
import type { CanvasSettings } from "../../../web-canvas/src/settings"
import type { WebpageSettings } from "../../../webpage/src/core/settings"
import type { CdpClient } from "../../../webpage/src/runtime/cdp"
import { launchWebpage } from "../../../webpage/src/runtime/webpage"
import { prepareYfsLaunchRoot } from "./cache"
import { waitForYfsReady } from "./diagnostics"
import {
  normalizeYfsLauncherSettings,
  parseYfsSettingsJson,
  type YfsLauncherSettings,
  yfsSettingsQuery,
} from "./settings-runtime"

const LAUNCHER_VERSION = "2"

export interface ParsedYfsLaunchCli {
  readonly levelFile: string
  readonly settings: YfsLauncherSettings
}

export function yfsShimPaths(): string[] {
  // The packaged YFS webroot already includes direct-launch-pre.js and
  // direct-launch.js. yfs-launch must not inject a second loader over that
  // document; doing so races the package loader and regresses seamless launch.
  return []
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

function parseViewport(value: string, flag: string): Record<string, number> {
  const match = value.match(/^(\d{1,5})x(\d{1,5})$/i)
  if (!match) throw new Error(`${flag} expects WIDTHxHEIGHT, got: ${value}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

function parseZoom(value: string, flag: string): Record<string, unknown> {
  if (value === "auto-area") return { mode: "auto-area" }
  const fixed = value.match(/^fixed:(.+)$/)
  if (fixed) return { mode: "fixed", scale: Number(fixed[1]) }
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return { mode: "fixed", scale: numeric }
  throw new Error(`${flag} expects auto-area|fixed:SCALE|SCALE, got: ${value}`)
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
    } else if (arg === "--viewport") {
      settings.viewport = parseViewport(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--viewport=")) {
      settings.viewport = parseViewport(
        arg.slice("--viewport=".length),
        "--viewport",
      )
    } else if (arg === "--viewport-aspect") {
      settings.viewport = {
        aspect: readValue(args, index, arg),
        policy: "expand-only",
      }
      index += 1
    } else if (arg.startsWith("--viewport-aspect=")) {
      settings.viewport = {
        aspect: arg.slice("--viewport-aspect=".length),
        policy: "expand-only",
      }
    } else if (arg === "--zoom") {
      settings.zoom = parseZoom(readValue(args, index, arg), arg)
      index += 1
    } else if (arg.startsWith("--zoom=")) {
      settings.zoom = parseZoom(arg.slice("--zoom=".length), "--zoom")
    } else if (arg === "--zoom-multiplier") {
      settings.zoom = {
        mode: "auto-area",
        multiplier: Number(readValue(args, index, arg)),
      }
      index += 1
    } else if (arg.startsWith("--zoom-multiplier=")) {
      settings.zoom = {
        mode: "auto-area",
        multiplier: Number(arg.slice("--zoom-multiplier=".length)),
      }
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
  cdp: CdpClient,
  proc: Bun.Subprocess,
): Promise<void> {
  await Promise.race([
    waitForYfsReady(cdp).then(() => undefined),
    proc.exited.then(code => {
      throw new Error(`Chromium exited before YFS loader became ready: ${code}`)
    }),
  ])
}

<<<<<<< HEAD
=======
interface CanvasRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

async function waitForCanvasRect(
  cdp: CdpClient,
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
  cdp: CdpClient,
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
  cdp: CdpClient,
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
  cdp: CdpClient,
): Promise<void> {
  const deadline = Date.now() + 60000
  // YFS boots to its title screen. A normal launcher must still advance to the
  // built-in Play Level screen before the level-code loader can inject content.
  // The title screen becomes interactive after Construct's boot animation, so
  // retry the trusted click until the visible level-code input appears.
  while (Date.now() < deadline) {
    if (await hasVisibleYfsLevelInput(cdp)) return
    let rect: CanvasRect
    try {
      rect = await waitForCanvasRect(cdp, 1000)
    } catch {
      await Bun.sleep(500)
      continue
    }
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
  throw new Error("Timed out opening the YFS Play Level UI")
}

>>>>>>> 4cc3a1cb (feat(yfs): migrate controller input to remap)
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
    for (const script of startupScripts) {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: script.source,
      })
      await cdp.evaluate(script.source)
    }
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
