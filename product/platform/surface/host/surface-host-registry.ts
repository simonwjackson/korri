import type { KorriSurfaceEntrypoint } from "@platform/surface/bridge"

export type FirstPartySurfaceId = "shift" | "evier" | "vigie" | "boxbuster"

type SurfaceEntrypointModule = {
  readonly default?: KorriSurfaceEntrypoint
}

const SURFACE_ENTRYPOINTS = {
  shift: () => import("@product/surfaces/web/shift/entry"),
  evier: () => import("@product/surfaces/web/evier/entry"),
  vigie: () => import("@product/surfaces/web/vigie/entry"),
  boxbuster: () => import("@product/surfaces/web/boxbuster/entry"),
} satisfies Record<FirstPartySurfaceId, () => Promise<SurfaceEntrypointModule>>

export async function loadSurfaceEntrypoint(
  surfaceId: FirstPartySurfaceId,
): Promise<KorriSurfaceEntrypoint> {
  const mod: SurfaceEntrypointModule = await SURFACE_ENTRYPOINTS[surfaceId]()
  const entrypoint = mod.default
  if (!entrypoint) {
    throw new Error(
      `Surface ${surfaceId} did not export a Korri surface entrypoint`,
    )
  }
  return entrypoint
}
