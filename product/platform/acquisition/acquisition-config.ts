export interface AcquisitionConfig {
  readonly stagingRoot: string
  readonly enabledProviderIds?: readonly string[]
}

export const defaultAcquisitionConfig: AcquisitionConfig = {
  stagingRoot: "out/acquisition",
}
