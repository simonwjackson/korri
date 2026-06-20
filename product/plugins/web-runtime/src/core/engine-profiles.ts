// Per-engine normalization policy.
//
// Maps a classified engine id to deterministic runtime behavior: whether the
// canvas is a fixed backing store (needs the gamescope gap + overflow-kill) vs
// responsive, which start-gate strategy applies, and which in-page shim to load.
// This is the one table that grows when a genuinely new engine needs different
// scaling/gate behavior; every game on that engine reuses it.

import type { EngineId } from "./engine-detect"
import type { GateStrategy } from "./gate"

export type ShimModule = "gamemaker" | "construct" | "generic"

export interface EngineProfile {
  readonly id: EngineId
  /** fixed backing store (true) vs responsive/letterbox-scaling (false) */
  readonly fixedCanvas: boolean
  readonly gate: GateStrategy
  /** inject html,body{overflow:hidden;margin:0} to prevent scrollbars */
  readonly killOverflow: boolean
  /** whether native render res can be probed, or must be declared by the launcher */
  readonly nativeResolution: "detect" | "declared-only"
  readonly shim: ShimModule
}

const PROFILES: Record<EngineId, EngineProfile> = {
  gamemaker: {
    id: "gamemaker",
    fixedCanvas: true,
    gate: "trusted-click",
    killOverflow: true,
    nativeResolution: "detect",
    shim: "gamemaker",
  },
  construct: {
    id: "construct",
    fixedCanvas: false,
    gate: "synthetic",
    killOverflow: false,
    nativeResolution: "declared-only",
    shim: "construct",
  },
  construct2: {
    id: "construct2",
    fixedCanvas: false,
    gate: "synthetic",
    killOverflow: false,
    nativeResolution: "declared-only",
    shim: "construct",
  },
  unity: {
    id: "unity",
    fixedCanvas: false,
    gate: "none",
    killOverflow: false,
    nativeResolution: "detect",
    shim: "generic",
  },
  godot: {
    id: "godot",
    fixedCanvas: false,
    gate: "none",
    killOverflow: false,
    nativeResolution: "detect",
    shim: "generic",
  },
  phaser: {
    id: "phaser",
    fixedCanvas: false,
    gate: "none",
    killOverflow: false,
    nativeResolution: "detect",
    shim: "generic",
  },
  pico8: {
    id: "pico8",
    fixedCanvas: true,
    gate: "trusted-click",
    killOverflow: true,
    nativeResolution: "detect",
    shim: "generic",
  },
  emscripten: {
    id: "emscripten",
    fixedCanvas: false,
    gate: "none",
    killOverflow: true,
    nativeResolution: "detect",
    shim: "generic",
  },
  generic: {
    id: "generic",
    fixedCanvas: false,
    gate: "none",
    killOverflow: true,
    nativeResolution: "detect",
    shim: "generic",
  },
}

export function engineProfile(id: EngineId): EngineProfile {
  return PROFILES[id] ?? PROFILES.generic
}
