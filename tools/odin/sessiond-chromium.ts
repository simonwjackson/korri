import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { KorriRendererController } from "./sessiond-renderer"

export interface ChromiumProfileFiles {
  readText: (path: string) => Promise<string>
  writeText: (path: string, content: string) => Promise<void>
  ensureDir: (path: string) => Promise<void>
}

export interface ChromiumLaunchConfig {
  readonly executablePath?: string
  readonly url?: string
  readonly profileDir?: string
  readonly logPath?: string
  readonly remoteDebuggingPort?: number
  readonly extraArgs?: readonly string[]
}

export interface ChromiumCommand {
  readonly command: string
  readonly args: readonly string[]
}

export interface ChromiumProcessRunner {
  spawn: (command: ChromiumCommand) => Promise<{ readonly pid: number }>
  kill?: (pid: number) => Promise<void>
}

export interface ChromiumController extends KorriRendererController {
  launch: () => Promise<{
    readonly pid: number
    readonly command: ChromiumCommand
  }>
  stop: (pid: number | undefined) => Promise<void>
}

export const DEFAULT_CHROMIUM_EXECUTABLE =
  "/storage/apps/chromium/squashfs-root/AppRun"
export const DEFAULT_CHROMIUM_PROFILE_DIR =
  "/storage/apps/chromium/korri-profile"
export const DEFAULT_KORRI_URL = "http://127.0.0.1:3100"

export async function normalizeChromiumProfile(
  profileDir: string,
  files: ChromiumProfileFiles = realProfileFiles,
): Promise<void> {
  const defaultDir = join(profileDir, "Default")
  await files.ensureDir(defaultDir)

  await normalizeJsonFile(join(defaultDir, "Preferences"), files, value => ({
    ...value,
    profile: {
      ...objectAt(value.profile),
      exit_type: "Normal",
      exited_cleanly: true,
    },
    session: {
      ...objectAt(value.session),
      restore_on_startup: 0,
    },
  }))

  await normalizeJsonFile(join(profileDir, "Local State"), files, value => ({
    ...value,
    exited_cleanly: true,
    profile: {
      ...objectAt(value.profile),
      info_cache: objectAt(objectAt(value.profile).info_cache),
    },
  }))
}

export function buildChromiumCommand(
  config: ChromiumLaunchConfig = {},
): ChromiumCommand {
  const executablePath = config.executablePath ?? DEFAULT_CHROMIUM_EXECUTABLE
  const profileDir = config.profileDir ?? DEFAULT_CHROMIUM_PROFILE_DIR
  const url = config.url ?? DEFAULT_KORRI_URL
  const remoteDebuggingPort = config.remoteDebuggingPort ?? 9222

  return {
    command: executablePath,
    args: [
      "--enable-features=UseOzonePlatform",
      "--ozone-platform=wayland",
      `--user-data-dir=${profileDir}`,
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--disable-infobars",
      "--disable-restore-session-state",
      "--overscroll-history-navigation=0",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${remoteDebuggingPort}`,
      "--start-fullscreen",
      "--kiosk",
      `--app=${url}`,
      ...(config.extraArgs ?? []),
    ],
  }
}

export function createChromiumController(options: {
  readonly config?: ChromiumLaunchConfig
  readonly runner: ChromiumProcessRunner
  readonly files?: ChromiumProfileFiles
}): ChromiumController {
  const config = options.config ?? {}
  const profileDir = config.profileDir ?? DEFAULT_CHROMIUM_PROFILE_DIR

  return {
    kind: "chromium",

    async launch() {
      await normalizeChromiumProfile(profileDir, options.files)
      const command = buildChromiumCommand(config)
      const process = await options.runner.spawn(command)
      return { pid: process.pid, command }
    },

    async stop(pid) {
      if (pid === undefined) return
      await options.runner.kill?.(pid)
    },
  }
}

async function normalizeJsonFile(
  path: string,
  files: ChromiumProfileFiles,
  update: (value: Record<string, unknown>) => Record<string, unknown>,
) {
  let value: Record<string, unknown> = {}
  try {
    const raw = await files.readText(path)
    const parsed = JSON.parse(raw)
    value = objectAt(parsed)
  } catch {
    value = {}
  }

  await files.ensureDir(dirname(path))
  await files.writeText(path, `${JSON.stringify(update(value), null, 2)}\n`)
}

function objectAt(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

const realProfileFiles: ChromiumProfileFiles = {
  readText: path => readFile(path, "utf8"),
  writeText: async (path, content) => {
    await writeFile(path, content)
  },
  ensureDir: async path => {
    await mkdir(path, { recursive: true })
  },
}
