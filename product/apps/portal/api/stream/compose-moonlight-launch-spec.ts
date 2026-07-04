import { readFile } from "node:fs/promises"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import { resolveInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import type { StreamerPolicy } from "@platform/library/config/streamer-policy"
import type { LaunchFailureKind, LaunchSpec } from "@platform/library/launcher"
import { dispatchStreamLaunch } from "@platform/stream/streamer-client"
import type { PluginRegistry } from "@platform/plugin/registry"

/**
 * Build a Moonlight `LaunchSpec` for `moonlight stream -app "Korri Stream" <host>`.
 * Plugin wrapping is applied by the generic launch companion flow.
 */
export interface ComposeMoonlightLaunchSpecOptions {
  /** Peer hostname or IP (IPv6 callers must strip brackets — see `moonlightHostFromControlUrl`). */
  readonly host: string
  /** Folded readable Moonlight policy. */
  readonly moonlight?: StreamerPolicy
  /** Resolved input devices from caller preflight. */
  readonly inputDevices?: readonly string[]
  /** Launch env allocated by caller preflight, for example local-control socket facts. */
  readonly environment?: Readonly<Record<string, string>>
  /** Plugin registry used to dispatch the streamer capability. */
  readonly registry: Pick<PluginRegistry, "enabledPlugins">
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
  const explicitInput = options.inputDevice
  if (explicitInput?.trim()) return { status: "ok", path: explicitInput.trim() }

  const required = options.requireInputPlumberInput ?? false
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

export async function composeMoonlightLaunchSpec(
  options: ComposeMoonlightLaunchSpecOptions,
): Promise<LaunchSpec> {
  return await dispatchStreamLaunch(options.registry, {
    ...(options.moonlight ? { policy: options.moonlight } : {}),
    facts: {
      host: options.host,
      ...(options.inputDevices ? { inputDevices: options.inputDevices } : {}),
      // Korri owns quit through the held chord + decision overlay, so Moonlight's
      // built-in instant Start+Select+L1+R1 quit combo (our exact chord) must be
      // disabled or it tears the stream down the moment the chord is pressed.
      // Read by vendor patch 0014. Caller-provided env wins on key collisions.
      environment: {
        KORRI_MOONLIGHT_DISABLE_GAMEPAD_QUIT: "1",
        ...(options.environment ?? {}),
      },
    },
  })
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

async function readRealProcDevices(): Promise<string> {
  return await readFile("/proc/bus/input/devices", "utf8")
}
