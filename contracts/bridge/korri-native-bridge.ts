/**
 * Treaty between the portal (TS, in the WebView) and the Android shell
 * (Kotlin, KorriShellActivity). This file is the source of truth for every
 * value that crosses the JS <-> Kotlin bridge.
 *
 * Rules:
 * - This directory imports nothing outside `contracts/`.
 * - Shapes only — no logic, no I/O.
 * - The Kotlin implementation mirrors these shapes by hand and cites this
 *   file. When the two sides disagree, this file wins.
 * - Changes are additive or bump BRIDGE_VERSION.
 *
 * Transport:
 * - JS -> Kotlin: methods on the injected `window.KorriNative` object.
 *   Methods take/return JSON strings encoding the types below.
 * - Kotlin -> JS: input events call `window.__korriInput(json)` with an
 *   encoded `BridgeInputEvent`. The portal registers that global.
 */

export const BRIDGE_VERSION = 1

// ── Launchables (JS -> Kotlin) ──────────────────────────────────────────

/** An app on the device that the launcher can start. */
export interface Launchable {
  readonly packageName: string
  readonly label: string
}

/** Result of `KorriNative.queryLaunchables()`. */
export type QueryLaunchablesResult =
  | { readonly _tag: "Launchables"; readonly items: readonly Launchable[] }
  | { readonly _tag: "QueryFailed"; readonly message: string }

/** Result of `KorriNative.launchApp(packageName)`. */
export type LaunchAppResult =
  | { readonly _tag: "Launched" }
  | {
      readonly _tag: "LaunchFailed"
      readonly reason: "NotFound" | "NoLaunchIntent" | "StartFailed"
      readonly message: string
    }

// ── Streaming (JS -> Kotlin) ────────────────────────────────────────────

/** A paired (or once-seen) stream host known to the shell. */
export interface StreamHost {
  readonly uuid: string
  readonly name: string
  readonly paired: boolean
}

/** Result of `KorriNative.queryStreamHosts()`. */
export type QueryStreamHostsResult =
  | { readonly _tag: "StreamHosts"; readonly items: readonly StreamHost[] }
  | { readonly _tag: "QueryFailed"; readonly message: string }

/** A streamable app on a host, from the shell's cached app list. */
export interface StreamApp {
  readonly id: number
  readonly name: string
}

/** Result of `KorriNative.queryStreamApps(hostUuid)`. */
export type QueryStreamAppsResult =
  | { readonly _tag: "StreamApps"; readonly items: readonly StreamApp[] }
  | { readonly _tag: "QueryFailed"; readonly message: string }

/** Result of `KorriNative.startStream(hostUuid, appId)`. */
export type StartStreamResult =
  | { readonly _tag: "StreamStarted" }
  | {
      readonly _tag: "StreamFailed"
      readonly reason:
        | "HostUnreachable"
        | "NotPaired"
        | "AppNotFound"
        | "StartFailed"
      readonly message: string
    }

// ── Input (Kotlin -> JS) ────────────────────────────────────────────────

/**
 * Semantic input vocabulary. The shell owns all hardware truth (key codes,
 * button indices, controller quirks) and emits only these. The portal never
 * sees a key code.
 *
 * This mirrors the portal's internal `InputAction` model (harvested from
 * legacy `product/platform/input/types.ts`); the portal's native adapter
 * converts wire events into that model at the seam.
 */
export type BridgeDirection = "up" | "down" | "left" | "right"

export type BridgeInputEvent =
  | {
      readonly type: "direction"
      readonly direction: BridgeDirection
      readonly source: "gamepad"
    }
  | { readonly type: "confirm"; readonly source: "gamepad" }
  | { readonly type: "back"; readonly source: "gamepad" }
  | { readonly type: "menu"; readonly source: "gamepad" }
  | { readonly type: "options"; readonly source: "gamepad" }

// ── Shell surface (JS -> Kotlin) ────────────────────────────────────────

/**
 * The full `window.KorriNative` surface the shell injects. Spike-era
 * methods (streaming, settings, korrid RPC) are intentionally not part of
 * the treaty yet; they join it when a slice formalizes them.
 */
export interface KorriNativeBridgeSurface {
  /** Returns JSON-encoded `QueryLaunchablesResult`. */
  queryLaunchables(): string
  /** Returns JSON-encoded `LaunchAppResult`. */
  launchApp(packageName: string): string
  /** Returns JSON-encoded `QueryStreamHostsResult`. */
  queryStreamHosts(): string
  /** Returns JSON-encoded `QueryStreamAppsResult`. */
  queryStreamApps(hostUuid: string): string
  /**
   * Starts the native stream Activity for an app on a paired host.
   * Returns JSON-encoded `StartStreamResult`; "StreamStarted" means the
   * Activity was launched, after which the portal is backgrounded until
   * the stream ends (see the `korri-shell-resumed` window event).
   */
  startStream(hostUuid: string, appId: number): string
  /** Returns `BRIDGE_VERSION` of the shell build. */
  bridgeVersion(): number
}

// ── Lifecycle (Kotlin -> JS) ────────────────────────────────────────────

/**
 * When the shell Activity resumes (e.g. returning from a stream), it
 * dispatches `window.dispatchEvent(new Event("korri-shell-resumed"))`.
 * The portal treats this as "your state may be stale; re-query".
 */
export const SHELL_RESUMED_EVENT = "korri-shell-resumed"
