/**
 * Spawn Moonlight locally to connect to a Korri stream host.
 *
 * Tries a configured Moonlight command first, optionally falls back to
 * `nix run nixpkgs#moonlight-qt`, and returns a structured result. The runner is swappable (`CommandRunner`)
 * so tests and the desktop’s bun-side bridge can intercept the spawn.
 *
 * Originally lived in `tools/cli/`; promoted to `@app/stream/` so the
 * desktop’s launch bridge can call it from the bun process without
 * depending on CLI code. The `tools/cli/moonlight-launcher.ts` file is
 * a re-export shim during the migration window.
 */
export type MoonlightLaunchResult =
  | { readonly status: "started"; readonly command: string }
  | { readonly status: "failed"; readonly message: string }

export interface CommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
    options?: { readonly startupObserveMs?: number },
  ) => Promise<
    | { readonly status: "started" }
    | { readonly status: "failed"; readonly message: string }
  >
}

export interface MoonlightLaunchOptions {
  readonly host?: string
  readonly appName?: string
  readonly command?: string
  readonly allowNixFallback?: boolean
  readonly startupObserveMs?: number
  readonly runner?: CommandRunner
}

const DEFAULT_APP_NAME = "Korri Stream"

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const args = moonlightArgs(options)
  const command = options.command ?? moonlightCommandFromEnv() ?? "moonlight"
  const allowNixFallback = options.allowNixFallback ?? command === "moonlight"
  const startupObserveMs =
    options.startupObserveMs ?? moonlightStartupObserveMsFromEnv()
  const installed = await runner.run(command, args, { startupObserveMs })
  if (installed.status === "started") return { status: "started", command }

  if (!allowNixFallback) {
    return {
      status: "failed",
      message: `Could not start Moonlight. ${command}: ${installed.message}`,
    }
  }

  const fallback = await runner.run("nix", [
    "run",
    "nixpkgs#moonlight-qt",
    "--",
    ...args,
  ])
  if (fallback.status === "started")
    return { status: "started", command: "nix" }

  return {
    status: "failed",
    message: `Could not start Moonlight. ${command}: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

function moonlightCommandFromEnv(): string | undefined {
  const env = globalThis.Bun?.env
  const command = env?.KORRI_MOONLIGHT_COMMAND?.trim()
  return command === "" ? undefined : command
}

function moonlightStartupObserveMsFromEnv(): number | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS?.trim()
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function moonlightArgs(options: MoonlightLaunchOptions): readonly string[] {
  if (!options.host) return []
  return ["stream", options.host, options.appName ?? DEFAULT_APP_NAME]
}

const spawnRunner: CommandRunner = {
  run: async (command, args, options) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
      const observedExit = await observeEarlyExit(
        child,
        options?.startupObserveMs,
      )
      if (observedExit !== undefined && observedExit !== 0) {
        return {
          status: "failed",
          message: `Moonlight exited early with status ${observedExit}`,
        }
      }
      child.unref?.()
      return { status: "started" }
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

async function observeEarlyExit(
  child: Bun.Subprocess<"ignore", "ignore", "ignore">,
  startupObserveMs: number | undefined,
): Promise<number | undefined> {
  if (!startupObserveMs || startupObserveMs <= 0) return undefined
  return Promise.race([
    child.exited,
    new Promise<undefined>(resolve => setTimeout(resolve, startupObserveMs)),
  ])
}
