import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import {
  type InputPlumberVirtualGamepadResolution,
  resolveInputPlumberVirtualGamepad,
} from "@platform/input/native/inputplumber-virtual-gamepad"
import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import type { StreamerPolicy } from "@platform/library/config/streamer-policy"
import { type LaunchSpec, launchEnvironment } from "@platform/library/launcher"
import {
  composeLaunchCompanions,
  launchCompanionDiagnosticSummary,
} from "@platform/plugin/launch-companion"
import type { PluginRegistry } from "@platform/plugin/registry"
import {
  activeStreamControlSessionRegistry,
  type StartStreamRuntimeSessionOptions,
  type StreamRuntimeSession,
} from "@platform/stream/stream-session"
import {
  dispatchStreamLaunch,
  type StreamLaunchRequest,
} from "@platform/stream/streamer-client"
import { createInteractiveFirstPartyPluginRegistry } from "@product/plugin-host"
import { Effect } from "effect"

const DEFAULT_STARTUP_OBSERVE_MS = 750

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

/**
 * Local structural views of the streamer policy fields this launcher reads. The
 * platform carries the policy opaquely (StreamerPolicy); the plugin owns full
 * validation. These views keep the launcher removable — no streamer-schema
 * import — while typing the handful of fields it inspects.
 */
interface MoonlightControlPolicyView {
  readonly enable?: boolean
  readonly authority?: "observer" | "controller"
  readonly allowRootPeers?: boolean
}

interface MoonlightLaunchPolicyView {
  readonly command?: string
  readonly control?: MoonlightControlPolicyView
  readonly input?: { readonly devices?: readonly string[] }
}

export interface MoonlightStreamRuntimeOptions {
  readonly socketPath: string
  readonly adaptive?: StartStreamRuntimeSessionOptions["adaptive"]
  readonly onRecoveryEvent?: StartStreamRuntimeSessionOptions["onRecoveryEvent"]
}

export interface MoonlightLaunchOptions {
  readonly host?: string
  readonly moonlight?: StreamerPolicy
  readonly allowNixFallback?: boolean
  readonly startupObserveMs?: number
  readonly inputDevice?: string
  readonly requireInputPlumberInput?: boolean
  readonly launchCompanions?: LaunchCompanionMap
  readonly pluginRegistry?: PluginRegistry
  readonly readProcDevices?: () => Promise<string>
  readonly runner?: CommandRunner
  readonly moonlightControl?: MoonlightControlLaunchOptions | false
  readonly startStreamRuntimeSession?: (
    options: MoonlightStreamRuntimeOptions,
  ) => Promise<{ readonly close: () => void }>
}

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const inputDevice = await moonlightInputDevice(options)
  if (inputDevice.status === "failed") return inputDevice

  const policy = (options.moonlight ?? {}) as MoonlightLaunchPolicyView
  const moonlightControl = await moonlightControlHandleFromOptions(
    options.moonlightControl,
    policy.control,
  )
  const environment = moonlightControl
    ? moonlightControlEnvForHandle(moonlightControl)
    : undefined

  const installedSpec = await composeMoonlightWithLaunchCompanions(
    {
      policy,
      facts: {
        host: options.host ?? "",
        ...(inputDevice.path ? { inputDevices: [inputDevice.path] } : {}),
        ...(environment ? { environment } : {}),
      },
    },
    options,
  )
  if (installedSpec._tag === "failed") return installedSpec

  const command = policy.command ?? "moonlight"
  const allowNixFallback = options.allowNixFallback ?? command === "moonlight"
  const startupObserveMs =
    options.startupObserveMs ?? DEFAULT_STARTUP_OBSERVE_MS
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
      startStreamRuntimeSession:
        options.startStreamRuntimeSession ?? defaultStartStreamRuntimeSession,
    })
  }

  if (!allowNixFallback) {
    return {
      status: "failed",
      message: `Could not start Moonlight. ${command}: ${installed.message}`,
    }
  }

  const bareFallbackMoonlight = await dispatchStreamLaunch(
    resolveStreamRegistry(options),
    {
      policy: { ...policy, command: "moonlight" },
      facts: {
        host: options.host ?? "",
        ...(inputDevice.path ? { inputDevices: [inputDevice.path] } : {}),
        ...(environment ? { environment } : {}),
      },
    },
  )
  const fallbackSpec = await composeLaunchSpecWithCompanions(
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
    options,
  )
  if (fallbackSpec._tag === "failed") return fallbackSpec

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
      startStreamRuntimeSession:
        options.startStreamRuntimeSession ?? defaultStartStreamRuntimeSession,
    })
  }

  return {
    status: "failed",
    message: `Could not start Moonlight. ${command}: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

type MoonlightSpecCompositionResult =
  | (LaunchSpec & { readonly _tag?: undefined })
  | {
      readonly _tag: "failed"
      readonly status: "failed"
      readonly message: string
    }

async function composeMoonlightWithLaunchCompanions(
  input: StreamLaunchRequest,
  options: MoonlightLaunchOptions,
): Promise<MoonlightSpecCompositionResult> {
  try {
    const spec = await dispatchStreamLaunch(
      resolveStreamRegistry(options),
      input,
    )
    return await composeLaunchSpecWithCompanions(spec, options)
  } catch (error) {
    return { _tag: "failed", status: "failed", message: errorMessage(error) }
  }
}

function resolveStreamRegistry(
  options: Pick<MoonlightLaunchOptions, "pluginRegistry">,
): PluginRegistry {
  return (
    options.pluginRegistry ??
    createInteractiveFirstPartyPluginRegistry(process.env)
  )
}

async function composeLaunchSpecWithCompanions(
  spec: LaunchSpec,
  options: Pick<MoonlightLaunchOptions, "launchCompanions" | "pluginRegistry">,
): Promise<MoonlightSpecCompositionResult> {
  const result = await Effect.runPromise(
    composeLaunchCompanions({
      spec,
      launchCompanions: options.launchCompanions,
      registry:
        options.pluginRegistry ??
        createInteractiveFirstPartyPluginRegistry(process.env),
      options: { launchId: "moonlight-compose" },
    }),
  )
  if (result._tag === "LaunchCompanionDiagnostics") {
    return {
      _tag: "failed",
      status: "failed",
      message: launchCompanionDiagnosticSummary(result.diagnostics),
    }
  }
  return result.spec
}

function startedMoonlightResult(input: {
  readonly command: string
  readonly moonlightControl?: MoonlightControlLaunchHandle
  readonly session?: ManagedMoonlightSessionHandle
  readonly startStreamRuntimeSession: (
    options: MoonlightStreamRuntimeOptions,
  ) => Promise<{ readonly close: () => void }>
}): MoonlightLaunchResult {
  const session =
    input.moonlightControl && input.session
      ? registerMoonlightControlSession(
          input.moonlightControl,
          input.session,
          input.startStreamRuntimeSession,
        )
      : input.session
  return {
    status: "started",
    command: input.command,
    ...(input.moonlightControl
      ? { moonlightControl: input.moonlightControl }
      : {}),
    ...(session ? { session } : {}),
  }
}

function registerMoonlightControlSession(
  control: MoonlightControlLaunchHandle,
  session: ManagedMoonlightSessionHandle,
  startStreamRuntimeSession: (
    options: MoonlightStreamRuntimeOptions,
  ) => Promise<StreamRuntimeSession>,
): ManagedMoonlightSessionHandle {
  let unregistering = false
  let runtimeClosed = false
  let runtimeSession: StreamRuntimeSession | undefined
  const closeRuntimeSession = () => {
    if (runtimeClosed) return
    runtimeClosed = true
    runtimeSession?.close()
  }
  const runtimeSessionPromise = startStreamRuntimeSession({
    socketPath: control.socketPath,
    ...runtimeSessionAdaptiveOptions(),
    onRecoveryEvent: event => {
      console.warn("korri stream recovery:", JSON.stringify(event))
    },
  }).then(runtime => {
    runtimeSession = runtime
    return runtime
  })
  void runtimeSessionPromise.catch(error => {
    console.warn(
      "korri stream runtime session failed:",
      error instanceof Error ? error.message : String(error),
    )
  })
  activeStreamControlSessionRegistry.register({
    sessionId: control.sessionId,
    socketPath: control.socketPath,
    adaptiveControl: () => runtimeSession?.adaptiveControl,
    close: () => {
      closeRuntimeSession()
      if (!unregistering) session.terminate()
    },
  })
  const unregister = () => {
    unregistering = true
    try {
      closeRuntimeSession()
      activeStreamControlSessionRegistry.unregister(control.sessionId)
    } finally {
      unregistering = false
    }
  }
  void session.exited.finally(unregister)
  return {
    ...session,
    terminate: () => {
      session.terminate()
      unregister()
    },
    terminateNow: () => {
      session.terminateNow()
      unregister()
    },
  }
}

export async function moonlightControlHandleFromOptions(
  options: MoonlightControlLaunchOptions | false | undefined,
  policy: MoonlightControlPolicyView | undefined = undefined,
): Promise<MoonlightControlLaunchHandle | undefined> {
  if (options === false) return undefined
  const enabled = options?.enabled ?? policy?.enable ?? false
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
    authority: options?.authority ?? policy?.authority ?? "observer",
    ...((options?.allowRootPeers ?? policy?.allowRootPeers) === true
      ? { allowRootPeers: true }
      : {}),
  }
}

export async function defaultStartStreamRuntimeSession(
  options: MoonlightStreamRuntimeOptions,
): Promise<{ readonly close: () => void }> {
  // Keep the launcher removable from the Moonlight plugin. The plugin package
  // is loaded only at runtime for Moonlight sessions and the literal import
  // path is intentionally not a static dependency.
  const modulePath = `${"@product/plugins/"}moonlight/src/stream-control/runtime-session`
  const module = await import(modulePath)
  return module.startMoonlightStreamRuntimeSession(options)
}

function runtimeSessionAdaptiveOptions(): Pick<
  MoonlightStreamRuntimeOptions,
  "adaptive"
> {
  const env = globalThis.Bun?.env ?? process.env
  const enabled = env.KORRI_STREAM_ADAPTIVE_ENABLED
  if (enabled !== "1" && enabled !== "true") return {}
  const objectiveBias = parseFiniteEnv(
    env.KORRI_STREAM_ADAPTIVE_OBJECTIVE_BIAS,
    0.5,
  )
  const tickIntervalMs = parseFiniteEnv(
    env.KORRI_STREAM_ADAPTIVE_TICK_MS,
    5_000,
  )
  return {
    adaptive: {
      enabled: true,
      objectiveBias,
      tickIntervalMs,
      isStreaming: () => true,
      onEvent: event => {
        console.info("korri stream adaptive:", JSON.stringify(event))
      },
    },
  }
}

function parseFiniteEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
  if (
    ((options.moonlight as MoonlightLaunchPolicyView | undefined)?.input
      ?.devices?.length ?? 0) > 0
  )
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
  const runtimeDir =
    globalThis.Bun?.env.XDG_RUNTIME_DIR?.trim() ||
    globalThis.Bun?.env.KORRI_GAME_STREAM_RUNTIME_DIR?.trim()
  if (!runtimeDir) {
    throw new Error(
      "XDG_RUNTIME_DIR or KORRI_GAME_STREAM_RUNTIME_DIR is required when Moonlight local control is enabled without an explicit runtimeDir",
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
