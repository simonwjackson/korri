/**
 * Launch-scoped artifact metadata produced while resolving a game launch.
 *
 * `root` is the per-launch artifact directory that lifecycle owners may clean
 * up after a terminal outcome. `paths` contains named staged files inside that
 * root (for example staged RetroArch content and patch sidecars). The metadata
 * is intentionally outside `LaunchSpec`: it is operational cleanup data, not
 * executable argv/env contract.
 */
export interface LaunchArtifacts {
  readonly root: string
  readonly paths: Readonly<Record<string, string>>
}
