import { closeSync, openSync, writeSync } from "node:fs"
import { mkdir, stat, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { korriDataPath, korriStatePath } from "@platform/config/xdg-paths"
import type { KorriRendererController } from "./sessiond-renderer"

export interface ElectrobunLaunchConfig {
  readonly executablePath?: string
  readonly statusFile?: string
  readonly stateRoot?: string
  readonly logPath?: string
  readonly sessiondSocket?: string
  readonly readinessTimeoutMs?: number
  readonly extraEnv?: Readonly<Record<string, string | undefined>>
}

export interface ElectrobunCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly logPath?: string
}

export interface ElectrobunProcessRunner {
  resolve: (command: string) => Promise<string | undefined>
  spawn: (command: ElectrobunCommand) => Promise<{ readonly pid: number }>
  kill?: (pid: number) => Promise<void>
}

export const DEFAULT_ELECTROBUN_EXECUTABLE = "korri-desktop-device"

export function defaultElectrobunStateRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return korriStatePath(env, "electrobun")
}

export function defaultElectrobunStatusFile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return join(defaultElectrobunStateRoot(env), "status.json")
}

export function buildElectrobunCommand(
  config: ElectrobunLaunchConfig = {},
): ElectrobunCommand {
  const envSource = { ...process.env, ...config.extraEnv }
  const stateRoot = config.stateRoot ?? defaultElectrobunStateRoot(envSource)
  const xdgConfigHome = join(stateRoot, "config")
  return {
    command: config.executablePath ?? DEFAULT_ELECTROBUN_EXECUTABLE,
    args: [],
    logPath: config.logPath,
    env: {
      ...config.extraEnv,
      NODE: undefined,
      NODE_ENV: undefined,
      PATH: sanitizeElectrobunPath(process.env.PATH),
      KORRI_DESKTOP_PROFILE: "device",
      KORRI_DEVICE_STATE_ROOT:
        envSource.KORRI_DEVICE_STATE_ROOT ?? korriDataPath(envSource),
      KORRI_LIBRARY_ROOT:
        envSource.KORRI_LIBRARY_ROOT ?? korriDataPath(envSource, "library"),
      KORRI_DESKTOP_STATUS_FILE:
        config.statusFile ?? join(stateRoot, "status.json"),
      KORRI_SESSIOND_SOCKET:
        config.sessiondSocket ?? envSource.KORRI_SESSIOND_SOCKET,
      XDG_DATA_HOME: join(stateRoot, "data"),
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_CACHE_HOME: join(stateRoot, "cache"),
      CHROME_CONFIG_HOME: xdgConfigHome,
    },
  }
}

export function classifyElectrobunBinaryOrigin(
  resolvedPath: string | undefined,
): "nix" | "non-nix" | "missing" {
  if (!resolvedPath) return "missing"
  return resolvedPath.startsWith("/nix/store/") ||
    resolvedPath.startsWith("/run/current-system/sw/")
    ? "nix"
    : "non-nix"
}

export function sanitizeElectrobunPath(path: string | undefined): string {
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

export function forbiddenElectrobunProductionEnv(
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  const flags: string[] = []
  if (env.GSK_RENDERER === "cairo") flags.push("GSK_RENDERER=cairo")
  if (env.WEBKIT_DISABLE_COMPOSITING_MODE === "1") {
    flags.push("WEBKIT_DISABLE_COMPOSITING_MODE=1")
  }
  if (env.WEBKIT_DISABLE_DMABUF_RENDERER === "1") {
    flags.push("WEBKIT_DISABLE_DMABUF_RENDERER=1")
  }
  return flags
}

export function createElectrobunController(options: {
  readonly config?: ElectrobunLaunchConfig
  readonly runner: ElectrobunProcessRunner
}): KorriRendererController {
  return {
    kind: "electrobun",

    async launch() {
      const command = buildElectrobunCommand(options.config)
      const forbidden = forbiddenElectrobunProductionEnv(command.env)
      if (forbidden.length > 0) {
        throw new Error(
          `Electrobun production renderer forbids fallback flags: ${forbidden.join(", ")}`,
        )
      }

      const resolved = await options.runner.resolve(command.command)
      const origin = classifyElectrobunBinaryOrigin(resolved)
      if (origin !== "nix") {
        throw new Error(
          `Electrobun renderer requires a Nix-managed app binary; got ${origin}${resolved ? ` (${resolved})` : ""}`,
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
            defaultElectrobunStateRoot({
              ...process.env,
              ...options.config?.extraEnv,
            }),
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

  throw new Error(`Electrobun did not write status file: ${path}`)
}

export const realElectrobunRunner: ElectrobunProcessRunner = {
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
      // Open the log in append mode (O_APPEND | O_CREAT | O_WRONLY) so
      // multiple spawn attempts in a sessiond restart loop accumulate
      // rather than each truncating the previous renderer's stderr.
      // Bun.file(path) used to back stdout here, but it truncates on
      // open which loses every Electrobun crash trace except the most
      // recent one — and the most recent one is often the parent-side
      // file-creation, not the child's stderr, because the child can
      // die before flushing. Append-mode keeps the full diagnostic
      // record.
      logFd = openSync(command.logPath, "a")
      writeSync(
        logFd,
        `\n=== electrobun spawn at ${new Date().toISOString()} ===\n`,
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
      // The child has its own dup of the fd; the parent can close.
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
