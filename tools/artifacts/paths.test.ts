import { describe, expect, test } from "bun:test"
import {
  artifactLayout,
  supportedArtifactPaths,
  tempArtifactPath,
} from "./paths"

describe("artifact layout", () => {
  test("defines the canonical out/ directory structure", () => {
    expect(artifactLayout).toEqual({
      root: "out",
      build: {
        portal: "out/build/portal",
        api: "out/build/api",
        electrobun: "out/build/electrobun",
      },
      reports: {
        coverage: "out/reports/coverage",
        playwright: "out/reports/playwright",
      },
      testResults: {
        e2e: "out/test-results/e2e",
        component: "out/test-results/component",
      },
      demoVideos: "out/demo-videos",
      desktopArtifacts: "out/artifacts/electrobun",
      runtimeWatch: "out/artifacts/moonlight-runtime-watch",
      generated: {
        bddPlaywright: "out/generated/bdd/playwright",
        bddArgo: "out/generated/bdd/argo",
      },
      tmp: "out/tmp",
    })
  })

  test("treats out/ as the only supported generated-output namespace", () => {
    expect(
      supportedArtifactPaths.every(
        path => path === "out" || path.startsWith("out/"),
      ),
    ).toBe(true)
    expect(new Set(supportedArtifactPaths).size).toBe(
      supportedArtifactPaths.length,
    )
    expect(tempArtifactPath).toBe("out/tmp")
  })
})
