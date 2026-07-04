/**
 * Route axis manifest — the per-route declaration of the state axes a screen
 * needs to render, so a space is `route × the values of these axes`.
 *
 * A route declares its axes on TanStack `staticData`; this module is the shared
 * shape plus a pure reader that projects a route's declared axes into the three
 * kinds tooling cares about. Product routes declare axis **names + kinds** only
 * (no lab/harness imports) — the option *values* come from the axis state
 * machines (`.tags`), and the runtime parsing of the addressable axes lives in
 * the route's `validateSearch`. The two are kept co-located on the route; this
 * reader is what the lab consumes to enumerate a route's axes uniformly.
 */

export type ShiftAxisKind = "search" | "param" | "data"

export interface ShiftRouteAxis {
  readonly name: string
  readonly kind: ShiftAxisKind
}

/** Shape carried on a route's `staticData.axes`. */
export interface ShiftRouteStaticData {
  readonly axes: readonly ShiftRouteAxis[]
}

export interface ShiftRouteManifest {
  readonly path: string
  /** Addressable via the route's typed URL search (deep-linkable). */
  readonly searchAxes: readonly string[]
  /** Addressable via path params; option lists depend on another axis (e.g. an
   * `id` populated by the `data` axis). */
  readonly paramAxes: readonly string[]
  /** Data/environment axes driven by seeding a real source layer. */
  readonly dataAxes: readonly string[]
}

/**
 * Project a route's declared axes (from `staticData`) into a manifest. Pure and
 * route-library-agnostic so it can be unit-tested without mounting a router.
 */
export function shiftRouteManifest(
  path: string,
  staticData: { readonly axes?: readonly ShiftRouteAxis[] } | undefined,
): ShiftRouteManifest {
  const axes = staticData?.axes ?? []
  const of = (kind: ShiftAxisKind) =>
    axes.filter(axis => axis.kind === kind).map(axis => axis.name)
  return {
    path,
    searchAxes: of("search"),
    paramAxes: of("param"),
    dataAxes: of("data"),
  }
}
