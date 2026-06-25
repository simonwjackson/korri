export type SurfacePartModule = Record<string, unknown>
export type SurfacePartLoader = () => Promise<SurfacePartModule>

export function surfacePartModules(): Record<string, SurfacePartLoader> {
  try {
    return import.meta.glob("./**/*.part.tsx")
  } catch {
    return {}
  }
}
