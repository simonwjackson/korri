/**
 * Spawn Moonlight locally to connect to a Korri stream host.
 *
 * Tries a configured Moonlight command first, optionally falls back to
 * `nix run nixpkgs#moonlight-embedded`, and returns a structured result. The runner is swappable (`CommandRunner`)
 * so tests and the desktop’s bun-side bridge can intercept the spawn.
 *
 * Originally lived in `tools/cli/`; promoted to `@app/stream/` so the
 * desktop’s launch bridge can call it from the bun process without
 * depending on CLI code. The `tools/cli/moonlight-launcher.ts` file is
 * a re-export shim during the migration window.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "@shared/input/native/discover-devices"
import {
  type InputPlumberVirtualGamepadResolution,
  resolveInputPlumberVirtualGamepad,
} from "@shared/input/native/inputplumber-virtual-gamepad"
import type { GamescopeOptions } from "../../../../tools/device/game-stream-fullscreen"
import { composeGamescopeLaunchSpec } from "../../../../tools/device/game-stream-fullscreen"

export interface MoonlightControlLaunchHandle {
  readonly sessionId: string
  readonly runtimeDir: string
  readonly socketPath: string
  readonly authority: "observer" | "controller"
}

export type MoonlightLaunchResult =
  | {
      readonly status: "started"
      readonly command: string
      readonly moonlightControl?: MoonlightControlLaunchHandle
    }
  | { readonly status: "failed"; readonly message: string }

export type MoonlightInputPreflightResult =
  | { readonly status: "ok" }
  | {
      readonly status: "failed"
      readonly category: "input-unavailable" | "input-ambiguous"
      readonly message: string
    }

export interface CommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
    options?: {
      readonly startupObserveMs?: number
      readonly env?: Readonly<Record<string, string>>
    },
  ) => Promise<
    | { readonly status: "started" }
    | { readonly status: "failed"; readonly message: string }
  >
}

export interface MoonlightControlLaunchOptions {
  readonly enabled?: boolean
  readonly sessionId?: string
  readonly runtimeDir?: string
  readonly socketPath?: string
  readonly authority?: "observer" | "controller"
}

export interface MoonlightLaunchOptions {
  readonly host?: string
  readonly appName?: string
  readonly command?: string
  readonly client?: "embedded"
  readonly allowNixFallback?: boolean
  readonly startupObserveMs?: number
  readonly mappingFile?: string
  readonly inputDevice?: string
  readonly requireInputPlumberInput?: boolean
  readonly platform?: string
  readonly gamescope?: GamescopeOptions
  readonly readProcDevices?: () => Promise<string>
  readonly runner?: CommandRunner
  readonly moonlightControl?: MoonlightControlLaunchOptions | false
}

const DEFAULT_APP_NAME = "Korri Stream"

export async function preflightMoonlightInput(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightInputPreflightResult> {
  const required =
    options.requireInputPlumberInput ?? moonlightRequireInputPlumberFromEnv()
  if (!required) return { status: "ok" }

  const inputDevice = await moonlightInputDevice(options)
  if (inputDevice.status === "ok") return { status: "ok" }
  return {
    status: "failed",
    category: inputDevice.category,
    message: inputDevice.message,
  }
}

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const command = options.command ?? moonlightCommandFromEnv() ?? "moonlight"
  const client = options.client ?? moonlightClientFromEnv() ?? "embedded"
  const inputDevice = await moonlightInputDevice(options)
  if (inputDevice.status === "failed") return inputDevice

  const platform = options.platform ?? moonlightPlatformFromEnv()
  const moonlightControl = await moonlightControlHandleFromOptions(
    options.moonlightControl,
  )
  const moonlightControlEnv = moonlightControl
    ? moonlightControlEnvForHandle(moonlightControl)
    : undefined

  const args = moonlightArgs({
    ...options,
    client,
    mappingFile: options.mappingFile ?? moonlightMappingFileFromEnv(),
    platform,
  })
  const allowNixFallback = options.allowNixFallback ?? command === "moonlight"
  const startupObserveMs =
    options.startupObserveMs ?? moonlightStartupObserveMsFromEnv()
  const installedSpec = moonlightCommandSpec(command, args, options.gamescope)
  const installed = await runner.run(
    installedSpec.command,
    installedSpec.args,
    {
      startupObserveMs,
      env: moonlightControlEnv,
    },
  )
  if (installed.status === "started") {
    return {
      status: "started",
      command: installedSpec.command,
      moonlightControl,
    }
  }

  if (!allowNixFallback) {
    return {
      status: "failed",
      message: `Could not start Moonlight. ${command}: ${installed.message}`,
    }
  }

  const fallbackSpec = moonlightCommandSpec(
    "nix",
    ["run", "nixpkgs#moonlight-embedded", "--", ...args],
    options.gamescope,
  )
  const fallback = await runner.run(fallbackSpec.command, fallbackSpec.args, {
    startupObserveMs,
    env: moonlightControlEnv,
  })
  if (fallback.status === "started") {
    return {
      status: "started",
      command: fallbackSpec.command,
      moonlightControl,
    }
  }

  return {
    status: "failed",
    message: `Could not start Moonlight. ${command}: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

function moonlightCommandSpec(
  command: string,
  args: readonly string[],
  gamescope: GamescopeOptions | undefined,
): { readonly command: string; readonly args: readonly string[] } {
  return composeGamescopeLaunchSpec(
    { command, args },
    gamescope ?? { enabled: true },
  )
}

function moonlightCommandFromEnv(): string | undefined {
  const env = globalThis.Bun?.env
  const command = env?.KORRI_MOONLIGHT_COMMAND?.trim()
  return command === "" ? undefined : command
}

function moonlightClientFromEnv(): "embedded" | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_CLIENT?.trim()
  return raw === "embedded" ? raw : undefined
}

function moonlightStartupObserveMsFromEnv(): number | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_STARTUP_OBSERVE_MS?.trim()
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function moonlightMappingFileFromEnv(): string | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_MAPPING_FILE?.trim()
  return raw === "" ? undefined : raw
}

function moonlightRequireInputPlumberFromEnv(): boolean {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER?.trim()
  return raw === "1" || raw === "true" || raw === "required"
}

function moonlightPlatformFromEnv(): string | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_PLATFORM?.trim()
  return raw === "" ? undefined : raw
}

async function moonlightControlHandleFromOptions(
  options: MoonlightControlLaunchOptions | false | undefined,
): Promise<MoonlightControlLaunchHandle | undefined> {
  if (options === false) return undefined
  const enabled = options?.enabled ?? moonlightControlEnabledFromEnv()
  if (!enabled) return undefined

  const sessionId =
    options?.sessionId ?? `moonlight-${randomUUID().replaceAll("-", "")}`
  const runtimeDir =
    options?.runtimeDir ?? join(moonlightControlRuntimeRootFromEnv(), sessionId)
  const socketPath = options?.socketPath ?? join(runtimeDir, "control.sock")
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })

  return {
    sessionId,
    runtimeDir,
    socketPath,
    authority: options?.authority ?? "observer",
  }
}

function moonlightControlEnabledFromEnv(): boolean {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_CONTROL?.trim()
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightControlRuntimeRootFromEnv(): string {
  const runtimeDir = globalThis.Bun?.env.XDG_RUNTIME_DIR?.trim()
  if (!runtimeDir) {
    throw new Error(
      "XDG_RUNTIME_DIR is required when Moonlight local control is enabled without an explicit runtimeDir",
    )
  }
  return join(runtimeDir, "korri-moonlight")
}

function moonlightControlEnvForHandle(
  handle: MoonlightControlLaunchHandle,
): Readonly<Record<string, string>> {
  return {
    MOONLIGHT_LOCAL_CONTROL_AUTHORITY: handle.authority,
    MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR: handle.runtimeDir,
    MOONLIGHT_LOCAL_CONTROL_SESSION_ID: handle.sessionId,
    MOONLIGHT_LOCAL_CONTROL_SOCKET: handle.socketPath,
  }
}

async function moonlightInputDevice(options: MoonlightLaunchOptions): Promise<
  | { readonly status: "ok"; readonly path?: string }
  | {
      readonly status: "failed"
      readonly category: "input-unavailable" | "input-ambiguous"
      readonly message: string
    }
> {
  const required =
    options.requireInputPlumberInput ?? moonlightRequireInputPlumberFromEnv()

  if (!required) return { status: "ok" }

  const proc = await (options.readProcDevices ?? readRealProcDevices)()
  const resolution = resolveInputPlumberVirtualGamepad(
    parseProcBusInputDevices(proc),
  )
  if (resolution.status !== "found") {
    return inputPlumberResolutionFailure(resolution)
  }

  return { status: "ok" }
}

function inputPlumberResolutionFailure(
  resolution: Exclude<
    InputPlumberVirtualGamepadResolution,
    { readonly status: "found" }
  >,
): {
  readonly status: "failed"
  readonly category: "input-unavailable" | "input-ambiguous"
  readonly message: string
} {
  if (resolution.status === "ambiguous") {
    return {
      status: "failed",
      category: "input-ambiguous",
      message: `Multiple InputPlumber virtual gamepads found: ${resolution.devices
        .map(device => device.eventNode)
        .join(", ")}`,
    }
  }

  return {
    status: "failed",
    category: "input-unavailable",
    message: `InputPlumber virtual gamepad not found (${resolution.rawGamepads} raw gamepad candidate(s) ignored)`,
  }
}

async function readRealProcDevices(): Promise<string> {
  return await readFile("/proc/bus/input/devices", "utf8")
}

function moonlightArgs(
  options: MoonlightLaunchOptions & { readonly client: "embedded" },
): readonly string[] {
  if (!options.host) return []
  const appName = options.appName ?? DEFAULT_APP_NAME
  return [
    "stream",
    ...(options.platform ? ["-platform", options.platform] : []),
    ...(options.mappingFile ? ["-mapping", options.mappingFile] : []),
    "-app",
    appName,
    options.host,
  ]
}

const spawnRunner: CommandRunner = {
  run: async (command, args, options) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: options?.env ? { ...Bun.env, ...options.env } : Bun.env,
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
