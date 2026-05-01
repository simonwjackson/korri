export const artifactRoot = "out" as const

export const buildArtifactPaths = {
  portal: `${artifactRoot}/build/portal`,
  api: `${artifactRoot}/build/api`,
  electrobun: `${artifactRoot}/build/electrobun`,
} as const

export const reportArtifactPaths = {
  coverage: `${artifactRoot}/reports/coverage`,
  playwright: `${artifactRoot}/reports/playwright`,
} as const

export const testResultArtifactPaths = {
  e2e: `${artifactRoot}/test-results/e2e`,
  component: `${artifactRoot}/test-results/component`,
} as const

export const demoVideoArtifactPath = `${artifactRoot}/demo-videos` as const

export const desktopArtifactPath =
  `${artifactRoot}/artifacts/electrobun` as const

export const generatedArtifactPaths = {
  bddPlaywright: `${artifactRoot}/generated/bdd/playwright`,
  bddArgo: `${artifactRoot}/generated/bdd/argo`,
} as const

export const tempArtifactPath = `${artifactRoot}/tmp` as const

export const artifactLayout = {
  root: artifactRoot,
  build: buildArtifactPaths,
  reports: reportArtifactPaths,
  testResults: testResultArtifactPaths,
  demoVideos: demoVideoArtifactPath,
  desktopArtifacts: desktopArtifactPath,
  generated: generatedArtifactPaths,
  tmp: tempArtifactPath,
} as const

export const supportedArtifactPaths = [
  artifactLayout.root,
  ...Object.values(artifactLayout.build),
  ...Object.values(artifactLayout.reports),
  ...Object.values(artifactLayout.testResults),
  artifactLayout.demoVideos,
  artifactLayout.desktopArtifacts,
  ...Object.values(artifactLayout.generated),
  artifactLayout.tmp,
] as const
