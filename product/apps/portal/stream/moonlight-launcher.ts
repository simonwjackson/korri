/**
 * Spawn Moonlight locally to connect to a Korri stream host.
 *
 * Tries a configured Moonlight command first, optionally falls back to
 * `nix run nixpkgs#moonlight-embedded`, and returns a structured result. The runner is swappable (`CommandRunner`)
 * so tests and the desktop’s bun-side bridge can intercept the spawn.
 *
 * Originally lived in `product/apps/cli/`; promoted to `@product/apps/portal/stream/` so the
 * desktop’s launch bridge can call it from the bun process without
 * depending on CLI code. The `product/apps/cli/moonlight-launcher.ts` file is
 * a re-export shim during the migration window.
 */
import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import {
  type InputPlumberVirtualGamepadResolution,
  resolveInputPlumberVirtualGamepad,
} from "@platform/input/native/inputplumber-virtual-gamepad"
import {
  composeGamescopeLaunchSpec,
  type GamescopeOptions,
} from "@platform/stream/gamescope-launch-spec"

export interface MoonlightControlLaunchHandle {
  readonly sessionId: string
  readonly runtimeDir: string
  readonly socketPath: string
  readonly authority: "observer" | "controller"
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
  readonly absoluteTouch?: boolean
  readonly absoluteTouchBounds?: string
  readonly absoluteTouchRequireBounds?: boolean
  readonly autoWindowResize?: boolean
  readonly gamescope?: GamescopeOptions
  readonly readProcDevices?: () => Promise<string>
  readonly runner?: CommandRunner
  readonly moonlightControl?: MoonlightControlLaunchOptions | false
}

const DEFAULT_APP_NAME = "Korri Stream"

export async function launchMoonlight(
  options: MoonlightLaunchOptions = {},
): Promise<MoonlightLaunchResult> {
  const runner = options.runner ?? spawnRunner
  const command = options.command ?? moonlightCommandFromEnv() ?? "moonlight"
  const client = options.client ?? moonlightClientFromEnv() ?? "embedded"
  const inputDevice = await moonlightInputDevice(options)
  if (inputDevice.status === "failed") return inputDevice

  const launchConfig = await resolveMoonlightLaunchConfig(
    options,
    client,
    inputDevice.path,
  )
  const moonlightControlEnv = launchConfig.moonlightControl
    ? moonlightControlEnvForHandle(launchConfig.moonlightControl)
    : undefined
  const args = moonlightArgs(launchConfig.argsOptions)
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
    return startedMoonlightResult({
      command: installedSpec.command,
      moonlightControl: launchConfig.moonlightControl,
      session: installed.session,
    })
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
    return startedMoonlightResult({
      command: fallbackSpec.command,
      moonlightControl: launchConfig.moonlightControl,
      session: fallback.session,
    })
  }

  return {
    status: "failed",
    message: `Could not start Moonlight. ${command}: ${installed.message}; nix fallback: ${fallback.message}`,
  }
}

async function resolveMoonlightLaunchConfig(
  options: MoonlightLaunchOptions,
  client: "embedded",
  inputDevice: string | undefined,
): Promise<{
  readonly moonlightControl?: MoonlightControlLaunchHandle
  readonly argsOptions: MoonlightLaunchOptions & { readonly client: "embedded" }
}> {
  const moonlightControl = await moonlightControlHandleFromOptions(
    options.moonlightControl,
  )
  const absoluteTouchBounds =
    options.absoluteTouchBounds ?? moonlightAbsoluteTouchBoundsFromEnv()
  const absoluteTouchRequireBounds =
    options.absoluteTouchRequireBounds ??
    moonlightAbsoluteTouchRequireBoundsFromEnv() ??
    false
  const absoluteTouch =
    options.absoluteTouch ??
    moonlightAbsoluteTouchFromEnv() ??
    (absoluteTouchBounds !== undefined || absoluteTouchRequireBounds)

  return {
    moonlightControl,
    argsOptions: {
      ...options,
      client,
      absoluteTouch,
      absoluteTouchBounds,
      absoluteTouchRequireBounds,
      inputDevice,
      mappingFile: options.mappingFile ?? moonlightMappingFileFromEnv(),
      platform: options.platform ?? moonlightPlatformFromEnv(),
    },
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

function moonlightCommandSpec(
  command: string,
  args: readonly string[],
  gamescope: GamescopeOptions | undefined,
): { readonly command: string; readonly args: readonly string[] } {
  // When Moonlight is launched with `-platform wayland`, the gamescope
  // wrap needs to expose its wayland socket so the Moonlight client
  // can use the native Wayland backend instead of falling through to
  // XWayland. Set exposeWayland explicitly here when the caller did
  // not already opt in or out.
  const platformWayland = args.some(
    (arg, index, source) =>
      arg === "-platform" && source[index + 1] === "wayland",
  )
  const baseline: GamescopeOptions = gamescope ?? { enabled: true }
  const resolved: GamescopeOptions =
    platformWayland && baseline.exposeWayland === undefined
      ? { ...baseline, exposeWayland: true }
      : baseline
  return composeGamescopeLaunchSpec({ command, args }, resolved)
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

function moonlightAbsoluteTouchFromEnv(): boolean | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightAbsoluteTouchBoundsFromEnv(): string | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS?.trim()
  return raw === "" ? undefined : raw
}

function moonlightAbsoluteTouchRequireBoundsFromEnv(): boolean | undefined {
  const raw =
    globalThis.Bun?.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightAutoWindowResize(options: MoonlightLaunchOptions): boolean {
  return (
    options.autoWindowResize ??
    moonlightAutoWindowResizeFromEnv() ??
    gamescopeEnabled(options.gamescope)
  )
}

function moonlightAutoWindowResizeFromEnv(): boolean | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

function gamescopeEnabled(gamescope: GamescopeOptions | undefined): boolean {
  return gamescope?.enabled !== false
}

function moonlightInputDeviceFromEnv(): string | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_INPUT_DEVICE?.trim()
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
    authority: options?.authority ?? moonlightControlAuthorityFromEnv() ?? "observer",
  }
}

function moonlightControlEnabledFromEnv(): boolean {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_CONTROL?.trim()
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightControlAuthorityFromEnv():
  | "observer"
  | "controller"
  | undefined {
  const raw = globalThis.Bun?.env.KORRI_MOONLIGHT_CONTROL_AUTHORITY?.trim()
  return raw === "observer" || raw === "controller" ? raw : undefined
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
  const explicitInput = options.inputDevice ?? moonlightInputDeviceFromEnv()
  if (explicitInput?.trim()) return { status: "ok", path: explicitInput.trim() }

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

function moonlightArgs(
  options: MoonlightLaunchOptions & { readonly client: "embedded" },
): readonly string[] {
  if (!options.host) return []
  const appName = options.appName ?? DEFAULT_APP_NAME
  return [
    "stream",
    ...(options.platform ? ["-platform", options.platform] : []),
    ...(options.mappingFile ? ["-mapping", options.mappingFile] : []),
    ...(options.inputDevice ? ["-input", options.inputDevice] : []),
    ...(options.absoluteTouch ? ["-absolutetouch"] : []),
    ...(options.absoluteTouchRequireBounds
      ? ["-absolutetouchrequirebounds"]
      : []),
    ...(options.absoluteTouchBounds
      ? ["-absolutetouchbounds", options.absoluteTouchBounds]
      : []),
    ...(moonlightAutoWindowResize(options) ? ["-autowindowresize"] : []),
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
