export interface AcquisitionConfig {
  readonly stagingRoot: string
  readonly enabledSourceNames?: readonly string[]
}

export const defaultAcquisitionConfig: AcquisitionConfig = {
  stagingRoot: "out/acquisition",
}
