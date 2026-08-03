/**
 * Korri surface treaty — the boundary between Korri and a presentation surface.
 *
 * A surface is a self-contained front end (Shift is the first). It renders what
 * Korri can currently do and asks Korri to do things; it never reaches into
 * korrid, the Android bridge, portal state, or any Rust-generated type. That
 * one-way dependency is what lets a surface live in its own repository — or
 * eventually ship as an installable theme — without dragging Korri with it.
 *
 * Rules this file exists to hold:
 *   - Korri hands the surface a MODEL (what is true right now) and a HOST
 *     (what the surface may ask for). Nothing else crosses.
 *   - The model carries only facts Korri can actually produce today. A surface
 *     may render less than the model offers, never more than Korri knows.
 *   - Absent data is `undefined`, never invented. A surface decides how to
 *     present the gap (Shift draws a title monogram in place of cover art).
 *   - Commands are fire-and-forget. Korri publishes the consequence as a new
 *     model; the surface never awaits a result or holds Korri's state.
 *
 * This file imports nothing. It is the whole contract.
 */

/**
 * Semantic input a surface may consume directly. Directional movement and
 * confirmation are deliberately absent: those are DOM focus and clicks, which
 * the host's input system already drives, so a surface never re-implements
 * navigation or learns which physical device produced an action.
 */
export type SurfaceInputAction = "back" | "options" | "menu" | "system"

export interface SurfaceInput {
  /** Subscribe to a semantic action. Returns an unsubscribe function. */
  on(action: SurfaceInputAction, handler: () => void): () => void
}

/**
 * One playable thing. `id` is opaque to the surface — it is handed back
 * verbatim when asking Korri to launch or act on it.
 */
export interface SurfaceGame {
  readonly id: string
  readonly title: string
  /**
   * Grouping caption ("Continue", "This device", a peer device's name). Games
   * sharing a section arrive consecutively; the surface groups on change.
   */
  readonly section?: string
  /** Short provenance line, e.g. "GBA · This device". */
  readonly subtitle?: string
  /** Cover art. Absent when Korri has none — surfaces must have a fallback. */
  readonly coverArtUrl?: string
  /** Wide/background art. Absent when Korri has none. */
  readonly wideArtUrl?: string
  /** True when confirming continues an existing session rather than starting. */
  readonly resumable?: boolean
}

/**
 * A non-game thing the user can do (pair a device, grant storage access, stop
 * the running game). Korri owns which of these exist and whether they apply;
 * the surface only renders and reports selection.
 */
export interface SurfaceAction {
  readonly id: string
  readonly label: string
  /** One-line explanation. Surfaces may show it or not. */
  readonly description?: string
  /** Present but inert. Surfaces render it dimmed rather than hiding it. */
  readonly enabled: boolean
  /** Destructive/irreversible. Surfaces may mark it. */
  readonly destructive?: boolean
}

/**
 * One readable fact about this device: what it is called, whether a permission
 * is granted, which peers are paired.
 *
 * Deliberately read-only. Korri has never written the user's configuration —
 * those files are authored by hand — so a settings row states what is true and
 * offers no switch. When Korri may change a setting, this gains a command; it
 * does not gain one before then, because a row that looks actionable and is not
 * is worse than no row.
 */
export interface SurfaceSettingItem {
  readonly id: string
  readonly label: string
  /** Current state as display text: "usu", "Granted", "2 paired". */
  readonly value?: string
  /** One-line explanation. Surfaces may show it or not. */
  readonly description?: string
}

/** A titled run of settings items. Korri omits groups it has nothing to say
 * about, so a surface never renders an empty heading. */
export interface SurfaceSettingGroup {
  readonly title: string
  readonly items: readonly SurfaceSettingItem[]
}

/** What Korri currently knows about the things that can be played. */
export type SurfaceCatalog =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Error"; readonly message: string }
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Ready"; readonly games: readonly SurfaceGame[] }

/**
 * Where the current launch stands. `Busy` and `Running` are informational;
 * `Problem` is the only state that offers the user a decision.
 */
export type SurfaceStatus =
  /** Nothing is happening. The surface shows its normal browsing presentation. */
  | { readonly _tag: "Browsing" }
  /** Work is under way. `kicker` is a short, calm headline ("Starting…"). */
  | {
      readonly _tag: "Busy"
      readonly kicker: string
      /** Optional progress detail. Never an error code or raw output. */
      readonly detail?: string
    }
  /** A launch is live. `gameId` is present when Korri knows which one. */
  | {
      readonly _tag: "Running"
      readonly kicker: string
      readonly gameId?: string
    }
  /**
   * Something did not work, stated in plain language. `reason` is already
   * user-facing copy — a surface must not attempt to interpret failure codes.
   */
  | {
      readonly _tag: "Problem"
      readonly kicker: string
      readonly reason: string
      readonly canRetry: boolean
    }

/** Everything Korri publishes to the surface. Replaced wholesale on change. */
export interface SurfaceModel {
  readonly catalog: SurfaceCatalog
  readonly status: SurfaceStatus
  /** Preformatted local time. Absent when the surface should show no clock. */
  readonly clockLabel?: string
  /** Device-level actions (pairing, permissions, stop). May be empty. */
  readonly actions: readonly SurfaceAction[]
  /** Readable device facts, grouped. Empty when Korri can state nothing. */
  readonly settings: readonly SurfaceSettingGroup[]
  /** Free-form build/identity stamp a surface may display. */
  readonly buildLabel?: string
}

/** Everything the surface may ask Korri to do. */
export interface SurfaceHost {
  readonly input: SurfaceInput
  /** Start or resume the game. Korri decides which, and how. */
  launchGame(gameId: string): void
  /** Run a device-level action from `SurfaceModel.actions`. */
  runAction(actionId: string): void
  /** Actions available for one game. Empty when Korri supports none yet. */
  gameActions(gameId: string): readonly SurfaceAction[]
  runGameAction(gameId: string, actionId: string): void
  /** Try the failed thing again. Only meaningful while `Problem.canRetry`. */
  retry(): void
  /** Acknowledge a `Problem` and return to browsing. */
  dismiss(): void
  /** Ask Korri to re-read everything (used by error recovery). */
  reload(): void
}

/**
 * A mounted surface. Korri pushes new models in and tears the surface down
 * through the same handle, so hosting a surface never requires knowing which
 * UI framework it was built with.
 */
export interface SurfaceInstance {
  update(model: SurfaceModel): void
  unmount(): void
}

/** The single entry point a surface package must export. */
export interface KorriSurface {
  readonly id: string
  readonly title: string
  mount(
    container: HTMLElement,
    model: SurfaceModel,
    host: SurfaceHost,
  ): SurfaceInstance
}
