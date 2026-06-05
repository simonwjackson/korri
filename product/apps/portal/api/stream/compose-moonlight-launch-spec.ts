import { readFile } from "node:fs/promises"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import { resolveInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import type { LaunchFailureKind, LaunchSpec } from "@platform/library/launcher"
import {
  composeGamescopeLaunchSpec,
  type GamescopeOptions,
} from "@platform/stream/gamescope-launch-spec"

/**
 * Build a Moonlight `LaunchSpec` for `gamescope -- moonlight stream -app "Korri Stream" <host>`
 * (or a bare `moonlight stream -app "Korri Stream" <host>` when gamescope is disabled).
 *
 * Mirrors `composeGamescopeLaunchSpec` for local launches. The server's
 * `app.library.launch` handler calls this to dispatch remote-source (Moonlight)
 * launches through the same `Launcher` / `ForegroundSessionHost` seam used by
 * local launches.
 *
 * Remote-source game identity is carried by the peer `prepare` intent. The
 * Moonlight app stays the stable Sunshine launcher (`Korri Stream`) so the
 * source machine's runner can consume `/run/korri-game-stream/next-launch.json`.
 */
export interface ComposeMoonlightLaunchSpecOptions {
  /** Peer hostname or IP (IPv6 callers must strip brackets — see `moonlightHostFromControlUrl`). */
  readonly host: string
  /** Sunshine app name. Defaults to `Korri Stream`. */
  readonly appName?: string
  /** Gamescope policy. Defaults to disabled when omitted. */
  readonly gamescope?: GamescopeOptions
  /** Override `moonlight` command. Defaults to env or `"moonlight"`. */
  readonly command?: string
  /** Override Moonlight Embedded platform. Defaults to `KORRI_MOONLIGHT_PLATFORM`. */
  readonly platform?: string
  /** Override controller mapping file. Defaults to `KORRI_MOONLIGHT_MAPPING_FILE`. */
  readonly mappingFile?: string
  /** Override input event device. Defaults to `KORRI_MOONLIGHT_INPUT_DEVICE`. */
  readonly inputDevice?: string
  /** Enable Moonlight Embedded absolute touch. Defaults to `KORRI_MOONLIGHT_ABSOLUTE_TOUCH`. */
  readonly absoluteTouch?: boolean
  /** Raw ABS x,y,w,h bounds for absolute touch. Defaults to `KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS`. */
  readonly absoluteTouchBounds?: string
  /** Ignore absolute touch until bounds are configured. Defaults to `KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS`. */
  readonly absoluteTouchRequireBounds?: boolean
  /** Resize the playback window to the stream size when it changes. Defaults to `KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE`. */
  readonly autoWindowResize?: boolean
}

export type MoonlightLaunchInputDeviceResolution =
  | { readonly status: "ok"; readonly path?: string }
  | {
      readonly status: "failed"
      readonly failureKind: Extract<
        LaunchFailureKind,
        "input-unavailable" | "input-ambiguous"
      >
      readonly message: string
    }

export interface ResolveMoonlightLaunchInputDeviceOptions {
  readonly inputDevice?: string
  readonly requireInputPlumberInput?: boolean
  readonly readProcDevices?: () => Promise<string>
}

export async function resolveMoonlightLaunchInputDevice(
  options: ResolveMoonlightLaunchInputDeviceOptions = {},
): Promise<MoonlightLaunchInputDeviceResolution> {
  const explicitInput = options.inputDevice ?? moonlightInputDeviceFromEnv()
  if (explicitInput?.trim()) return { status: "ok", path: explicitInput.trim() }

  const required =
    options.requireInputPlumberInput ?? moonlightRequireInputPlumberFromEnv()
  if (!required) return { status: "ok" }

  const proc = await (options.readProcDevices ?? readRealProcDevices)()
  const resolution = resolveInputPlumberVirtualGamepad(
    parseProcBusInputDevices(proc),
  )

  if (resolution.status === "found") {
    return { status: "ok", path: resolution.path }
  }

  if (resolution.status === "ambiguous") {
    return {
      status: "failed",
      failureKind: "input-ambiguous",
      message: `InputPlumber virtual controller is ambiguous (${resolution.devices.length} candidates); refusing to launch Moonlight without a stable input device`,
    }
  }

  return {
    status: "failed",
    failureKind: "input-unavailable",
    message: `InputPlumber virtual controller is missing (${resolution.rawGamepads} raw gamepad candidates); refusing to launch Moonlight without mapped controller input`,
  }
}

export function composeMoonlightLaunchSpec(
  options: ComposeMoonlightLaunchSpecOptions,
): LaunchSpec {
  if (!options.host)
    throw new Error("composeMoonlightLaunchSpec: host is required")

  const appName = options.appName ?? DEFAULT_APP_NAME
  if (!appName.trim())
    throw new Error("composeMoonlightLaunchSpec: appName is required")

  const command =
    options.command ?? moonlightCommandFromEnv() ?? DEFAULT_MOONLIGHT_COMMAND
  const args = composeMoonlightArgs(options, appName)

  return composeGamescopeLaunchSpec(
    { command, args },
    options.gamescope ?? { enabled: false },
  )
}

function composeMoonlightArgs(
  options: ComposeMoonlightLaunchSpecOptions,
  appName: string,
): readonly string[] {
  const args = ["stream"]
  appendOption(
    args,
    "-platform",
    options.platform ?? moonlightPlatformFromEnv(),
  )
  appendOption(
    args,
    "-mapping",
    options.mappingFile ?? moonlightMappingFileFromEnv(),
  )
  appendOption(
    args,
    "-input",
    options.inputDevice ?? moonlightInputDeviceFromEnv(),
  )
  appendAbsoluteTouchArgs(args, resolveAbsoluteTouchOptions(options))
  if (options.autoWindowResize ?? moonlightAutoWindowResizeFromEnv()) {
    args.push("-autowindowresize")
  }
  args.push("-app", appName, options.host)
  return args
}

function appendOption(args: string[], flag: string, value: string | undefined) {
  if (value) args.push(flag, value)
}

function resolveAbsoluteTouchOptions(
  options: ComposeMoonlightLaunchSpecOptions,
): {
  readonly enabled: boolean
  readonly requireBounds: boolean
  readonly bounds?: string
} {
  const bounds =
    options.absoluteTouchBounds ?? moonlightAbsoluteTouchBoundsFromEnv()
  const requireBounds =
    options.absoluteTouchRequireBounds ??
    moonlightAbsoluteTouchRequireBoundsFromEnv() ??
    false
  return {
    enabled:
      options.absoluteTouch ??
      moonlightAbsoluteTouchFromEnv() ??
      (bounds !== undefined || requireBounds),
    requireBounds,
    bounds,
  }
}

function appendAbsoluteTouchArgs(
  args: string[],
  touch: ReturnType<typeof resolveAbsoluteTouchOptions>,
) {
  if (touch.enabled) args.push("-absolutetouch")
  if (touch.requireBounds) args.push("-absolutetouchrequirebounds")
  appendOption(args, "-absolutetouchbounds", touch.bounds)
}

/**
 * Extract the host portion of a peer `controlUrl` for use as Moonlight's
 * `<host>` argument. Strips IPv6 brackets (`[::1]` → `::1`).
 */
export function moonlightHostFromControlUrl(controlUrl: string): string {
  if (!controlUrl) {
    throw new Error(
      `moonlightHostFromControlUrl: controlUrl is required (got ${JSON.stringify(controlUrl)})`,
    )
  }
  let url: URL
  try {
    url = new URL(controlUrl)
  } catch {
    throw new Error(
      `moonlightHostFromControlUrl: invalid controlUrl ${JSON.stringify(controlUrl)}`,
    )
  }
  // URL.hostname keeps IPv6 brackets stripped already for IPv6, but defensively
  // remove any leading/trailing `[` `]` if a caller hands us something exotic.
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "")
}

const DEFAULT_APP_NAME = "Korri Stream"
const DEFAULT_MOONLIGHT_COMMAND = "moonlight"

function moonlightCommandFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_COMMAND")
}

function moonlightPlatformFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_PLATFORM")
}

function moonlightMappingFileFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_MAPPING_FILE")
}

function moonlightInputDeviceFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_INPUT_DEVICE")
}

function moonlightAbsoluteTouchFromEnv(): boolean | undefined {
  const raw = process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightAbsoluteTouchBoundsFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_ABSOLUTE_TOUCH_BOUNDS")
}

function moonlightAbsoluteTouchRequireBoundsFromEnv(): boolean | undefined {
  const raw = process.env.KORRI_MOONLIGHT_ABSOLUTE_TOUCH_REQUIRE_BOUNDS?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

function moonlightRequireInputPlumberFromEnv(): boolean {
  const raw = process.env.KORRI_MOONLIGHT_REQUIRE_INPUTPLUMBER?.trim()
  return raw === "1" || raw === "true" || raw === "required"
}

function moonlightAutoWindowResizeFromEnv(): boolean | undefined {
  const raw = process.env.KORRI_MOONLIGHT_AUTO_WINDOW_RESIZE?.trim()
  if (!raw) return undefined
  return raw === "1" || raw === "true" || raw === "enabled"
}

async function readRealProcDevices(): Promise<string> {
  return await readFile("/proc/bus/input/devices", "utf8")
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
