import type { DiscoveredDevice } from "@platform/input/native/discover-devices"
import { isInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import type { RemapControllerPolicy } from "./policy"
import type { RemapPlayerSlot } from "./control-ref"

export interface RemapResolvedControllerSource {
  readonly player: RemapPlayerSlot
  readonly device: DiscoveredDevice
  readonly path: string
}

export type RemapControllerSourceResolution =
  | {
      readonly status: "resolved"
      readonly controllers: Partial<
        Record<RemapPlayerSlot, RemapResolvedControllerSource>
      >
    }
  | {
      readonly status: "failed"
      readonly reason: "missing" | "ambiguous" | "duplicate" | "unsupported-source"
      readonly player: RemapPlayerSlot
      readonly message: string
      readonly devices?: readonly DiscoveredDevice[]
    }

export interface ResolveRemapControllerSourcesOptions {
  readonly inputRoot?: string
}

const DEFAULT_CONTROLLERS: Partial<Record<RemapPlayerSlot, RemapControllerPolicy>> = {
  p1: { source: "inputplumber-virtual-gamepad" },
}

export function resolveRemapControllerSources(
  devices: readonly DiscoveredDevice[],
  controllers: Partial<Record<RemapPlayerSlot, RemapControllerPolicy>> = DEFAULT_CONTROLLERS,
  options: ResolveRemapControllerSourcesOptions = {},
): RemapControllerSourceResolution {
  const candidates = devices.filter(isInputPlumberVirtualGamepad)
  const resolved: Partial<Record<RemapPlayerSlot, RemapResolvedControllerSource>> = {}
  const usedEventNodes = new Set<string>()

  for (const [player, policy] of Object.entries(controllers) as [
    RemapPlayerSlot,
    RemapControllerPolicy,
  ][]) {
    if (policy.source !== "inputplumber-virtual-gamepad") {
      return failed(
        player,
        "unsupported-source",
        `Remap controller ${player} source is not supported: ${policy.source}`,
      )
    }

    const selection = selectCandidate(candidates, policy)
    if (selection.status !== "found") {
      return failed(
        player,
        selection.status,
        `Remap controller ${player} ${selection.status}: ${selection.message}`,
        selection.devices,
      )
    }

    if (usedEventNodes.has(selection.device.eventNode)) {
      return failed(
        player,
        "duplicate",
        `Remap controller ${player} resolves to already-used event node ${selection.device.eventNode}`,
        [selection.device],
      )
    }

    usedEventNodes.add(selection.device.eventNode)
    resolved[player] = {
      player,
      device: selection.device,
      path: `${options.inputRoot ?? "/dev/input"}/${selection.device.eventNode}`,
    }
  }

  return { status: "resolved", controllers: resolved }
}

type CandidateSelection =
  | { readonly status: "found"; readonly device: DiscoveredDevice }
  | {
      readonly status: "missing" | "ambiguous"
      readonly message: string
      readonly devices?: readonly DiscoveredDevice[]
    }

function selectCandidate(
  candidates: readonly DiscoveredDevice[],
  policy: RemapControllerPolicy,
): CandidateSelection {
  const preferredName = policy.prefer?.name
  const selection = preferredName
    ? candidates.filter(device => slugify(device.name) === preferredName)
    : candidates

  if (selection.length === 1 && selection[0]) {
    return { status: "found", device: selection[0] }
  }
  if (selection.length > 1) {
    return {
      status: "ambiguous",
      message: `${selection.length} InputPlumber virtual gamepads matched`,
      devices: selection,
    }
  }
  return {
    status: "missing",
    message: preferredName
      ? `no InputPlumber virtual gamepad matched ${preferredName}`
      : "no InputPlumber virtual gamepad found",
  }
}

function failed(
  player: RemapPlayerSlot,
  reason: "missing" | "ambiguous" | "duplicate" | "unsupported-source",
  message: string,
  devices?: readonly DiscoveredDevice[],
): RemapControllerSourceResolution {
  return {
    status: "failed",
    reason,
    player,
    message,
    ...(devices ? { devices } : {}),
  }
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
