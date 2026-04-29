export const artifactRoot = "out" as const

export const buildArtifactPaths = {
  portal: `${artifactRoot}/build/portal`,
  api: `${artifactRoot}/build/api`,
} as const

export const reportArtifactPaths = {
  coverage: `${artifactRoot}/reports/coverage`,
} as const

export const tempArtifactPath = `${artifactRoot}/tmp` as const

export const artifactLayout = {
  root: artifactRoot,
  build: buildArtifactPaths,
  reports: reportArtifactPaths,
  tmp: tempArtifactPath,
} as const

export const supportedArtifactPaths = [
  artifactLayout.root,
  ...Object.values(artifactLayout.build),
  ...Object.values(artifactLayout.reports),
  artifactLayout.tmp,
] as const
