import type { PluginRef, SurfaceId, SurfaceManifest } from "./surface-manifest"

export class DuplicateSurfaceIdError extends Error {
  readonly _tag = "DuplicateSurfaceIdError"

  constructor(readonly surfaceId: SurfaceId) {
    super(`Duplicate surface id: ${surfaceId}`)
  }
}

export class SurfaceDependencyError extends Error {
  readonly _tag = "SurfaceDependencyError"

  constructor(
    readonly surfaceId: SurfaceId,
    readonly ref: PluginRef,
  ) {
    super(`Surface ${surfaceId} must not reference surface ${ref}`)
  }
}

export interface SurfaceRegistry {
  readonly list: () => readonly SurfaceManifest[]
  readonly get: (id: SurfaceId) => SurfaceManifest | undefined
}

export function createSurfaceRegistry(
  manifests: readonly SurfaceManifest[],
): SurfaceRegistry {
  const byId = new Map<SurfaceId, SurfaceManifest>()

  for (const manifest of manifests) {
    if (byId.has(manifest.id)) {
      throw new DuplicateSurfaceIdError(manifest.id)
    }
    byId.set(manifest.id, manifest)
  }

  for (const manifest of manifests) {
    for (const ref of [...manifest.requires, ...manifest.recommends]) {
      if (byId.has(ref as SurfaceId)) {
        throw new SurfaceDependencyError(manifest.id, ref)
      }
    }
  }

  return {
    list: () => manifests,
    get: id => byId.get(id),
  }
}
