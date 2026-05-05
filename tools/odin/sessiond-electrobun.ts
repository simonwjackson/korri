import { join } from "node:path"
import type { KorriRendererController } from "./sessiond-renderer"

export interface ElectrobunLaunchConfig {
  readonly executablePath?: string
  readonly statusFile?: string
  readonly stateRoot?: string
  readonly logPath?: string
  readonly sessiondUrl?: string
  readonly sessiondTokenFile?: string
  readonly extraEnv?: Readonly<Record<string, string | undefined>>
}

export interface ElectrobunCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
}

export interface ElectrobunProcessRunner {
  resolve: (command: string) => Promise<string | undefined>
  spawn: (command: ElectrobunCommand) => Promise<{ readonly pid: number }>
  kill?: (pid: number) => Promise<void>
}

export const DEFAULT_ELECTROBUN_EXECUTABLE = "korri-desktop-odin"
export const DEFAULT_ELECTROBUN_STATE_ROOT =
  "/storage/.local/share/nix-apps/korri-electrobun"
export const DEFAULT_ELECTROBUN_STATUS_FILE = join(
  DEFAULT_ELECTROBUN_STATE_ROOT,
  "status.json",
)

export function buildElectrobunCommand(
  config: ElectrobunLaunchConfig = {},
): ElectrobunCommand {
  const stateRoot = config.stateRoot ?? DEFAULT_ELECTROBUN_STATE_ROOT
  return {
    command: config.executablePath ?? DEFAULT_ELECTROBUN_EXECUTABLE,
    args: [],
    env: {
      ...config.extraEnv,
      KORRI_DESKTOP_PROFILE: "odin",
      KORRI_DESKTOP_STATUS_FILE:
        config.statusFile ?? DEFAULT_ELECTROBUN_STATUS_FILE,
      KORRI_SESSIOND_URL: config.sessiondUrl ?? process.env.KORRI_SESSIOND_URL,
      KORRI_SESSIOND_TOKEN_FILE:
        config.sessiondTokenFile ?? process.env.KORRI_SESSIOND_TOKEN_FILE,
      XDG_DATA_HOME: join(stateRoot, "data"),
      XDG_CONFIG_HOME: join(stateRoot, "config"),
      XDG_CACHE_HOME: join(stateRoot, "cache"),
      CHROME_CONFIG_HOME: join(stateRoot, "config"),
    },
  }
}

export function classifyElectrobunBinaryOrigin(
  resolvedPath: string | undefined,
): "nix" | "non-nix" | "missing" {
  if (!resolvedPath) return "missing"
  return resolvedPath.startsWith("/nix/store/") ||
    resolvedPath.startsWith("/storage/.nix-profile/")
    ? "nix"
    : "non-nix"
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

      const process = await options.runner.spawn(command)
      return {
        pid: process.pid,
        command: { command: resolved ?? command.command, args: command.args },
        metadata: {
          statusFile: command.env.KORRI_DESKTOP_STATUS_FILE,
          stateRoot: options.config?.stateRoot ?? DEFAULT_ELECTROBUN_STATE_ROOT,
        },
      }
    },

    async stop(pid) {
      if (pid === undefined) return
      await options.runner.kill?.(pid)
    },
  }
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
    const proc = Bun.spawn([command.command, ...command.args], {
      stdout: "ignore",
      stderr: "ignore",
      env: { ...process.env, ...command.env },
    })
    return { pid: proc.pid }
  },
  kill: async pid => {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Already gone.
    }
  },
}
