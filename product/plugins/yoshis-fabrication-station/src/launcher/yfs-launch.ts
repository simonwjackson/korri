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
  decodeYfsLauncherSettings,
  type YfsLauncherSettings,
  yfsSettingsQuery,
} from "./settings"

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

export function parseYfsLaunchCli(argv: readonly string[]): ParsedYfsLaunchCli {
  const settings: Record<string, unknown> = {}
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
  return { levelFile, settings: decodeYfsLauncherSettings(settings) }
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

export interface RunYfsLaunchOptions {
  readonly argv: readonly string[]
  readonly env?: Record<string, string | undefined>
}

export async function runYfsLaunch(
  options: RunYfsLaunchOptions,
): Promise<number> {
  const parsed = parseYfsLaunchCli(options.argv)
  const env = options.env ?? process.env
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
    await waitForYfsReady(cdp)
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
  runYfsLaunch({ argv: process.argv.slice(2) }).catch(error => {
    console.error(
      `yfs-launch: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
