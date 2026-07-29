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

// 2 and 3 are skipped: the shipped shell reported 3 while this file lagged
// at 1. 4 introduced the session lifecycle; 5 adds the per-server korrid
// capability required to protect localhost session-control RPCs.
export const BRIDGE_VERSION = 5

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
  /**
   * Port of the embedded korrid server on 127.0.0.1, or -1 when it is not
   * running. The portal builds its brain base URL from this; hardware and
   * process lifecycle stay on the Kotlin side of the treaty.
   */
  korridPort(): number
  /**
   * Unguessable capability for this embedded korrid server lifetime. The
   * portal sends it as a bearer token; it must never be persisted.
   */
  korridCapability(): string
  /** Returns `BRIDGE_VERSION` of the shell build. */
  bridgeVersion(): number
}

// ── Stream session lifecycle (v4) ────────────────────────────────────

/**
 * Korri-initiated streams narrate their pre-stream lifecycle to a
 * portal-origin overlay WebView inside the stream Activity. The overlay is
 * the same bundled portal app booted on the session screen: the asset-loader
 * origin URL plus `?SESSION_SCREEN_PARAM=SESSION_SCREEN_VALUE`.
 *
 * Contract shape is pull-then-push, mirroring `__korriInput`:
 * - Pull: on boot the overlay calls `KorriSession.lifecycleSnapshot()` and
 *   folds the returned event log. This closes the race where stages fire
 *   before the overlay's JS is ready.
 * - Push: the shell then calls `window.__korriSessionEvent(json)` with each
 *   new JSON-encoded `StreamLifecycleEvent`. Events may overlap with the
 *   snapshot; consumers must treat replayed/duplicate stage events as
 *   idempotent and never regress the timeline.
 *
 * Only Korri-initiated streams (launched via `startStream`) inject
 * `KorriSession` and show the overlay; stock Artemis entry points are
 * untouched.
 */

/** Query parameter that boots the bundled portal on the session screen. */
export const SESSION_SCREEN_PARAM = "screen"
export const SESSION_SCREEN_VALUE = "session"

/**
 * Semantic connection stages. Kotlin owns the mapping from raw Moonlight
 * stage strings (moonlight-common-c `getStageName` values plus the
 * app-launch stage, which is named after the app) into these ids; the raw
 * native string rides along as `detail` for display only and is never a
 * contract value.
 */
export type StreamStageId =
  /** Host is launching or resuming the requested app. */
  | "launching-app"
  /** Platform initialization and name resolution. */
  | "initializing"
  /** RTSP handshake with the host. */
  | "handshaking"
  /** Control/video/audio/input stream bring-up. */
  | "establishing-streams"

/**
 * Tagged failure vocabulary for pre-stream failures and terminations.
 * Kotlin derives these from stage names, error codes, and port-test
 * results; the numeric `errorCode` rides along for diagnostics.
 */
export type StreamFailureReason =
  | "AppLaunchFailed"
  | "HostUnreachable"
  | "PermissionDenied"
  | "DecoderInitFailed"
  | "NoVideoTraffic"
  | "ConnectionLost"
  | "Unknown"

/**
 * One step in the stream session lifecycle, pushed by the shell as it
 * happens and replayed in order by `lifecycleSnapshot()`.
 *
 * - `stage-starting` / `stage-complete` mirror Moonlight's stage callbacks.
 * - `connected` mirrors `connectionStarted()`: frames are imminent, the
 *   shell removes the overlay. Terminal for the overlay's happy path.
 * - `failed` is a pre-stream stage failure; the overlay renders the tagged
 *   reason and offers a way back to the portal.
 * - `terminated` is a connection ending after establishment. `graceful`
 *   distinguishes the user quitting from an error termination.
 */
export type StreamLifecycleEvent =
  | {
      readonly type: "stage-starting"
      readonly stage: StreamStageId
      readonly detail?: string
    }
  | {
      readonly type: "stage-complete"
      readonly stage: StreamStageId
      readonly detail?: string
    }
  | { readonly type: "connected" }
  | {
      readonly type: "failed"
      readonly reason: StreamFailureReason
      readonly stage: StreamStageId
      readonly errorCode: number
      readonly detail?: string
    }
  | {
      readonly type: "terminated"
      readonly graceful: boolean
      readonly reason: StreamFailureReason
      readonly errorCode: number
    }

/** Result of `KorriSession.lifecycleSnapshot()`: the event log so far. */
export interface StreamLifecycleSnapshot {
  readonly events: readonly StreamLifecycleEvent[]
}

/**
 * The `window.KorriSession` surface injected only into the session-screen
 * overlay WebView inside the stream Activity. The launcher WebView never
 * sees it; the overlay uses its absence to detect browser dev and render a
 * fixture timeline instead.
 */
export interface KorriSessionBridgeSurface {
  /** Returns JSON-encoded `StreamLifecycleSnapshot`. */
  lifecycleSnapshot(): string
  /**
   * User acknowledged a failure (or backed out): finish the stream
   * Activity and return to the portal Activity beneath it.
   */
  exitToPortal(): void
}

// ── Lifecycle (Kotlin -> JS) ────────────────────────────────────────────

/**
 * When the shell Activity resumes (e.g. returning from a stream), it
 * dispatches `window.dispatchEvent(new Event("korri-shell-resumed"))`.
 * The portal treats this as "your state may be stale; re-query".
 */
export const SHELL_RESUMED_EVENT = "korri-shell-resumed"
