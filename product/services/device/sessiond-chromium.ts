import { closeSync, openSync, writeSync } from "node:fs"
import { mkdir, stat, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { korriStatePath } from "@platform/config/xdg-paths"
import type { KorriRendererController } from "./sessiond-renderer"

export interface ChromiumLaunchConfig {
  readonly executablePath?: string
  readonly hostUrl?: string
  readonly statusFile?: string
  readonly stateRoot?: string
  readonly logPath?: string
  readonly readinessTimeoutMs?: number
  readonly extraArgs?: readonly string[]
  readonly extraEnv?: Readonly<Record<string, string | undefined>>
}

export interface ChromiumCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly logPath?: string
}

export interface ChromiumProcessRunner {
  resolve: (command: string) => Promise<string | undefined>
  spawn: (command: ChromiumCommand) => Promise<{ readonly pid: number }>
  kill?: (pid: number) => Promise<void>
}

export const DEFAULT_CHROMIUM_EXECUTABLE = "korri-chromium-kiosk"
export const DEFAULT_CHROMIUM_HOST_URL = "http://127.0.0.1:8099/"

export function defaultChromiumStateRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return korriStatePath(env, "chromium")
}

export function defaultChromiumStatusFile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return join(defaultChromiumStateRoot(env), "status.json")
}

export function buildChromiumCommand(
  config: ChromiumLaunchConfig = {},
): ChromiumCommand {
  const envSource = { ...process.env, ...config.extraEnv }
  const stateRoot = config.stateRoot ?? defaultChromiumStateRoot(envSource)
  const hostUrl = normalizedHostUrl(config.hostUrl ?? DEFAULT_CHROMIUM_HOST_URL)
  const statusFile = config.statusFile ?? join(stateRoot, "status.json")
  const xdgConfigHome = join(stateRoot, "config")

  return {
    command: config.executablePath ?? DEFAULT_CHROMIUM_EXECUTABLE,
    args: [
      "--ozone-platform=wayland",
      `--app=${hostUrl}`,
      "--kiosk",
      `--user-data-dir=${join(stateRoot, "profile")}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--noerrdialogs",
      "--disable-infobars",
      "--disable-session-crashed-bubble",
      "--disable-features=Translate",
      ...(config.extraArgs ?? []),
    ],
    logPath: config.logPath,
    env: {
      ...config.extraEnv,
      NODE: undefined,
      NODE_ENV: undefined,
      PATH: sanitizeChromiumPath(process.env.PATH),
      KORRI_WEB_SURFACE_URL: hostUrl,
      KORRI_DESKTOP_STATUS_FILE: statusFile,
      XDG_DATA_HOME: join(stateRoot, "data"),
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_CACHE_HOME: join(stateRoot, "cache"),
      CHROME_CONFIG_HOME: xdgConfigHome,
    },
  }
}

export function classifyChromiumBinaryOrigin(
  resolvedPath: string | undefined,
): "nix" | "non-nix" | "missing" {
  if (!resolvedPath) return "missing"
  return resolvedPath.startsWith("/nix/store/") ||
    resolvedPath.startsWith("/run/current-system/sw/")
    ? "nix"
    : "non-nix"
}

export function sanitizeChromiumPath(path: string | undefined): string {
  const entries = (path ?? "").split(":").filter(Boolean)
  const sanitized = entries.filter(
    entry =>
      !entry.includes("/node_modules/.bin") &&
      !entry.startsWith("/tmp/bun-node"),
  )

  for (const required of ["/run/current-system/sw/bin"]) {
    if (!sanitized.includes(required)) sanitized.unshift(required)
  }

  return sanitized.join(":")
}

export function createChromiumController(options: {
  readonly config?: ChromiumLaunchConfig
  readonly runner: ChromiumProcessRunner
}): KorriRendererController {
  return {
    kind: "chromium",

    async launch() {
      const command = buildChromiumCommand(options.config)
      const resolved = await options.runner.resolve(command.command)
      const origin = classifyChromiumBinaryOrigin(resolved)
      if (origin !== "nix") {
        throw new Error(
          `Chromium renderer requires a Nix-managed app binary; got ${origin}${resolved ? ` (${resolved})` : ""}`,
        )
      }

      await removeStaleStatusFile(command.env.KORRI_DESKTOP_STATUS_FILE)
      const childProcess = await options.runner.spawn(command)
      try {
        await waitForStatusFile(
          command.env.KORRI_DESKTOP_STATUS_FILE,
          options.config?.readinessTimeoutMs ?? 0,
        )
      } catch (error) {
        await options.runner.kill?.(childProcess.pid)
        throw error
      }
      return {
        pid: childProcess.pid,
        command: { command: resolved ?? command.command, args: command.args },
        metadata: {
          statusFile: command.env.KORRI_DESKTOP_STATUS_FILE,
          stateRoot:
            options.config?.stateRoot ??
            defaultChromiumStateRoot({
              ...process.env,
              ...options.config?.extraEnv,
            }),
          hostUrl: command.env.KORRI_WEB_SURFACE_URL,
        },
      }
    },

    async stop(pid) {
      if (pid === undefined) return
      await options.runner.kill?.(pid)
    },
  }
}

async function removeStaleStatusFile(path: string | undefined): Promise<void> {
  if (!path) return
  try {
    await unlink(path)
  } catch {
    // Missing stale status files are expected.
  }
}

async function waitForStatusFile(
  path: string | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!path || timeoutMs <= 0) return

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const status = await stat(path)
      if (status.size > 0) return
    } catch {
      // Not ready yet.
    }
    await Bun.sleep(100)
  }

  throw new Error(`Chromium renderer did not become ready: ${path}`)
}

function normalizedHostUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`
}

export const realChromiumRunner: ChromiumProcessRunner = {
  resolve: async command => {
    if (command.startsWith("/")) return command
    const proc = Bun.spawn(["sh", "-lc", `command -v -- "$0"`, command], {
      stdout: "pipe",
      stderr: "ignore",
    })
    const stdout = (await new Response(proc.stdout).text()).trim()
    const exitCode = await proc.exited
    return exitCode === 0 && stdout ? stdout : undefined
  },
  spawn: async command => {
    let logFd: number | undefined
    if (command.logPath) {
      await mkdir(dirname(command.logPath), { recursive: true })
      logFd = openSync(command.logPath, "a")
      writeSync(
        logFd,
        `\n=== chromium spawn at ${new Date().toISOString()} ===\n`,
      )
    }
    const stdio: "ignore" | number = logFd ?? "ignore"
    try {
      const proc = Bun.spawn([command.command, ...command.args], {
        stdout: stdio,
        stderr: stdio,
        env: { ...process.env, ...command.env },
        detached: true,
      })
      if (logFd !== undefined) {
        writeSync(logFd, `--- spawned child pid=${proc.pid} ---\n`)
      }
      return { pid: proc.pid }
    } finally {
      if (logFd !== undefined) closeSync(logFd)
    }
  },
  kill: async pid => {
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      try {
        process.kill(pid, "SIGTERM")
      } catch {
        // Already gone.
      }
    }
  },
}
