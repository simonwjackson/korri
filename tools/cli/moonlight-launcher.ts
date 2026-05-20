export type MoonlightLaunchResult =
  | { readonly status: "started"; readonly command: string }
  | { readonly status: "failed"; readonly message: string }

export interface CommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
  ) => Promise<
    | { readonly status: "started" }
    | { readonly status: "failed"; readonly message: string }
  >
}

export interface MoonlightLaunchOptions {
  readonly host?: string
  readonly appName?: string
  readonly runner?: CommandRunner
}

const DEFAULT_APP_NAME = "Korri Stream"

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const args = moonlightArgs(options)
  const installed = await runner.run("moonlight", args)
  if (installed.status === "started")
    return { status: "started", command: "moonlight" }

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
    message: `Could not start Moonlight. moonlight: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

function moonlightArgs(options: MoonlightLaunchOptions): readonly string[] {
  if (!options.host) return []
  return ["stream", options.host, options.appName ?? DEFAULT_APP_NAME]
}

const spawnRunner: CommandRunner = {
  run: async (command, args) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
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
