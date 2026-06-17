import { readFile } from "node:fs/promises"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import { resolveInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import type {
  GamescopePolicy,
  MoonlightPolicy,
} from "@platform/library/config/inheritable-fields"
import type { LaunchFailureKind, LaunchSpec } from "@platform/library/launcher"
import { composeMoonlightGamescopeLaunchSpec } from "@platform/stream/moonlight-launch-spec"
import { composeGamescopeLaunchSpec } from "@product/plugins/gamescope/launch-companion"

/**
 * Build a Moonlight `LaunchSpec` for `moonlight stream -app "Korri Stream" <host>`.
 * Gamescope wrapping is driven by the sibling Gamescope policy, never by sniffing
 * Moonlight argv.
 */
export interface ComposeMoonlightLaunchSpecOptions {
  /** Peer hostname or IP (IPv6 callers must strip brackets — see `moonlightHostFromControlUrl`). */
  readonly host: string
  /** Folded readable Moonlight policy. */
  readonly moonlight?: MoonlightPolicy
  /** Folded sibling Gamescope policy. Defaults to disabled when omitted. */
  readonly gamescope?: GamescopePolicy
  /** Resolved input devices from caller preflight. */
  readonly inputDevices?: readonly string[]
  /** Launch env allocated by caller preflight, for example local-control socket facts. */
  readonly environment?: Readonly<Record<string, string>>
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

export function composeMoonlightLaunchSpec(
  options: ComposeMoonlightLaunchSpecOptions,
): LaunchSpec {
  return composeMoonlightGamescopeLaunchSpec({
    policy: options.moonlight,
    gamescope: options.gamescope ?? { enable: false },
    wrapGamescopeLaunchSpec: composeGamescopeLaunchSpec,
    facts: {
      host: options.host,
      ...(options.inputDevices ? { inputDevices: options.inputDevices } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
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
