import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import {
  type InputPlumberVirtualGamepadResolution,
  resolveInputPlumberVirtualGamepad,
} from "@platform/input/native/inputplumber-virtual-gamepad"
import type {
  GamescopePolicy,
  MoonlightPolicy,
} from "@platform/library/config/inheritable-fields"
import { type LaunchSpec, launchEnvironment } from "@platform/library/launcher"
import { composeGamescopeLaunchSpec } from "@platform/stream/gamescope-launch-spec"
import {
  composeMoonlightGamescopeLaunchSpec,
  composeMoonlightStreamLaunchSpec,
  validateMoonlightGamescopePolicy,
} from "@platform/stream/moonlight-launch-spec"

export interface MoonlightControlLaunchHandle {
  readonly sessionId: string
  readonly runtimeDir: string
  readonly socketPath: string
  readonly authority: "observer" | "controller"
  readonly allowRootPeers?: boolean
}

export interface ManagedMoonlightSessionHandle {
  readonly id: string
  readonly processId?: number
  readonly exited: Promise<{ readonly exitCode: number | null }>
  readonly isGone?: () => Promise<boolean> | boolean
  readonly terminate: () => void
  readonly terminateNow: () => void
}

export type MoonlightLaunchResult =
  | {
      readonly status: "started"
      readonly command: string
      readonly moonlightControl?: MoonlightControlLaunchHandle
      readonly session?: ManagedMoonlightSessionHandle
    }
  | { readonly status: "failed"; readonly message: string }

export interface CommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
    options?: {
      readonly startupObserveMs?: number
      readonly env?: Readonly<Record<string, string>>
      readonly envUnset?: readonly string[]
    },
  ) => Promise<
    | {
        readonly status: "started"
        readonly session?: ManagedMoonlightSessionHandle
      }
    | { readonly status: "failed"; readonly message: string }
  >
}

export interface MoonlightControlLaunchOptions {
  readonly enabled?: boolean
  readonly sessionId?: string
  readonly runtimeDir?: string
  readonly socketPath?: string
  readonly authority?: "observer" | "controller"
  readonly allowRootPeers?: boolean
}

export interface MoonlightLaunchOptions {
  readonly host?: string
  readonly moonlight?: MoonlightPolicy
  readonly allowNixFallback?: boolean
  readonly startupObserveMs?: number
  readonly inputDevice?: string
  readonly requireInputPlumberInput?: boolean
  readonly gamescope?: GamescopePolicy
  readonly readProcDevices?: () => Promise<string>
  readonly runner?: CommandRunner
  readonly moonlightControl?: MoonlightControlLaunchOptions | false
}

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const inputDevice = await moonlightInputDevice(options)
  if (inputDevice.status === "failed") return inputDevice

  const policy = options.moonlight ?? {}
  const moonlightControl = await moonlightControlHandleFromOptions(
    options.moonlightControl,
    policy.control,
  )
  const environment = moonlightControl
    ? moonlightControlEnvForHandle(moonlightControl)
    : undefined

  let installedSpec: LaunchSpec
  try {
    installedSpec = composeMoonlightGamescopeLaunchSpec({
      policy,
      gamescope: options.gamescope ?? { enable: true },
      facts: {
        host: options.host ?? "",
        ...(inputDevice.path ? { inputDevices: [inputDevice.path] } : {}),
        ...(environment ? { environment } : {}),
      },
    })
  } catch (error) {
    return { status: "failed", message: errorMessage(error) }
  }

  const command = policy.command ?? "moonlight"
  const allowNixFallback = options.allowNixFallback ?? command === "moonlight"
  const startupObserveMs = options.startupObserveMs
  const installed = await runner.run(
    installedSpec.command,
    installedSpec.args,
    {
      startupObserveMs,
      env: installedSpec.env,
      envUnset: installedSpec.envUnset,
    },
  )
  if (installed.status === "started") {
    return startedMoonlightResult({
      command: installedSpec.command,
      moonlightControl,
      session: installed.session,
    })
  }

  if (!allowNixFallback) {
    return {
      status: "failed",
      message: `Could not start Moonlight. ${command}: ${installed.message}`,
    }
  }

  const bareFallbackMoonlight = composeMoonlightStreamLaunchSpec({
    policy: { ...policy, command: "moonlight" },
    facts: {
      host: options.host ?? "",
      ...(inputDevice.path ? { inputDevices: [inputDevice.path] } : {}),
      ...(environment ? { environment } : {}),
    },
  })
  const fallbackSpec = composeGamescopeLaunchSpec(
    {
      command: "nix",
      args: [
        "run",
        "nixpkgs#moonlight-embedded",
        "--",
        ...bareFallbackMoonlight.args,
      ],
      ...(bareFallbackMoonlight.env ? { env: bareFallbackMoonlight.env } : {}),
      ...(bareFallbackMoonlight.envUnset
        ? { envUnset: bareFallbackMoonlight.envUnset }
        : {}),
    },
    options.gamescope ?? { enable: true },
  )

  const fallback = await runner.run(fallbackSpec.command, fallbackSpec.args, {
    startupObserveMs,
    env: fallbackSpec.env,
    envUnset: fallbackSpec.envUnset,
  })
  if (fallback.status === "started") {
    return startedMoonlightResult({
      command: fallbackSpec.command,
      moonlightControl,
      session: fallback.session,
    })
  }

  return {
    status: "failed",
    message: `Could not start Moonlight. ${command}: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

function startedMoonlightResult(input: {
  readonly command: string
  readonly moonlightControl?: MoonlightControlLaunchHandle
  readonly session?: ManagedMoonlightSessionHandle
}): MoonlightLaunchResult {
  return {
    status: "started",
    command: input.command,
    ...(input.moonlightControl
      ? { moonlightControl: input.moonlightControl }
      : {}),
    ...(input.session ? { session: input.session } : {}),
  }
}

export async function moonlightControlHandleFromOptions(
  options: MoonlightControlLaunchOptions | false | undefined,
  policy: MoonlightPolicy["control"] | undefined = undefined,
): Promise<MoonlightControlLaunchHandle | undefined> {
  if (options === false) return undefined
  const enabled = options?.enabled ?? policy?.enable ?? false
  if (!enabled) return undefined

  const sessionId =
    options?.sessionId ??
    policy?.sessionId ??
    `moonlight-${randomUUID().replaceAll("-", "")}`
  const runtimeDir =
    options?.runtimeDir ??
    policy?.runtimeDir ??
    join(moonlightControlRuntimeRootFromEnv(), sessionId)
  const socketPath =
    options?.socketPath ??
    policy?.socketPath ??
    join(runtimeDir, "control.sock")
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })

  return {
    sessionId,
    runtimeDir,
    socketPath,
    authority: options?.authority ?? policy?.authority ?? "observer",
    ...((options?.allowRootPeers ?? policy?.allowRootPeers) === true
      ? { allowRootPeers: true }
      : {}),
  }
}

export function moonlightControlEnvForHandle(
  handle: MoonlightControlLaunchHandle,
): Readonly<Record<string, string>> {
  return {
    MOONLIGHT_LOCAL_CONTROL_AUTHORITY: handle.authority,
    MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR: handle.runtimeDir,
    MOONLIGHT_LOCAL_CONTROL_SESSION_ID: handle.sessionId,
    MOONLIGHT_LOCAL_CONTROL_SOCKET: handle.socketPath,
    ...(handle.allowRootPeers
      ? { MOONLIGHT_LOCAL_CONTROL_ALLOW_ROOT: "1" }
      : {}),
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
  const explicitInput = options.inputDevice
  if (explicitInput?.trim()) return { status: "ok", path: explicitInput.trim() }
  if ((options.moonlight?.input?.devices?.length ?? 0) > 0)
    return { status: "ok" }

  const required = options.requireInputPlumberInput ?? false

  if (!required) return { status: "ok" }

  const proc = await (options.readProcDevices ?? readRealProcDevices)()
  const resolution = resolveInputPlumberVirtualGamepad(
    parseProcBusInputDevices(proc),
  )
  if (resolution.status !== "found") {
    return inputPlumberResolutionFailure(resolution)
  }

  return { status: "ok", path: resolution.path }
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

const spawnRunner: CommandRunner = {
  run: async (command, args, options) => {
    try {
      const child = Bun.spawn([command, ...args], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: launchEnvironment(
          { env: options?.env, envUnset: options?.envUnset },
          Bun.env,
        ),
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
      return {
        status: "started",
        session: {
          id: `pid-${child.pid}`,
          processId: child.pid,
          exited: child.exited.then(exitCode => ({ exitCode })),
          isGone: () => isProcessGone(child.pid),
          terminate: () => child.kill("SIGTERM"),
          terminateNow: () => child.kill("SIGKILL"),
        },
      }
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  },
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

function isProcessGone(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      return error.code === "ESRCH"
    }
    return true
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { validateMoonlightGamescopePolicy }
