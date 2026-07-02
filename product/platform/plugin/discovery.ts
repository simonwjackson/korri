import type { PluginId, PluginResult, ProviderId } from "./index"

export type ReleaseDiscoveryProviderId = `${ProviderId}/${string}`

export interface FileDiscoveryDescriptor {
  readonly storageId: string
  readonly rootPath: string
  readonly absolutePath: string
  readonly relativePath: string
  readonly name: string
  readonly extension: string
}

export interface ReleaseDiscoveryContext {
  readonly pluginId: PluginId
  readonly storageId: string
  readonly rootPath: string
  readonly files: readonly FileDiscoveryDescriptor[]
}

export interface ReleaseDiscoveryEvidence {
  readonly kind: string
  readonly value: string
}

export type ReleaseDiscoveryConfidence = "high" | "medium" | "low"

export interface FileReleaseDiscoveryObservation {
  readonly kind: "file-release"
  readonly confidence: ReleaseDiscoveryConfidence
  readonly source: FileDiscoveryDescriptor
  readonly release: {
    readonly id: string
    readonly title?: string
    readonly system: string
    readonly app: string
    readonly runtime: string
  }
  readonly evidence?: readonly ReleaseDiscoveryEvidence[]
}

export type ReleaseDiscoveryObservation = FileReleaseDiscoveryObservation

export interface ReleaseDiscoveryProvider {
  readonly id: ReleaseDiscoveryProviderId
  readonly title?: string
  readonly discover: (
    context: ReleaseDiscoveryContext,
  ) => PluginResult<readonly ReleaseDiscoveryObservation[]>
}

export function releaseDiscoveryProvider(
  provider: ReleaseDiscoveryProvider,
): ReleaseDiscoveryProvider {
  return provider
}
