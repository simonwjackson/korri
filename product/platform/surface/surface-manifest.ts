export type SurfaceId = `@korri:${string}`
export type PluginRef = `@korri:${string}`

export type SurfaceMedium = "web" | "terminal" | "framebuffer" | "native" | "ssh"

export type Capability =
  | "catalog.read"
  | "library.launch"
  | "session.read"
  | "session.stop"
  | "stream-control.read"
  | "stream-control.write"
  | "input.subscribe"

export interface SurfaceManifest {
  readonly id: SurfaceId
  readonly kind: "surface"
  readonly medium: SurfaceMedium
  readonly consumes: readonly Capability[]
  readonly requires: readonly PluginRef[]
  readonly recommends: readonly PluginRef[]
}

export type SurfaceManifestInput = Omit<
  SurfaceManifest,
  "requires" | "recommends"
> & {
  readonly requires?: readonly PluginRef[]
  readonly recommends?: readonly PluginRef[]
}

export function defineSurface(input: SurfaceManifestInput): SurfaceManifest {
  return {
    ...input,
    requires: input.requires ?? [],
    recommends: input.recommends ?? [],
  }
}
