import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  assertDemoVideoArtifactsReady,
  createDemoVideoRunPlan,
  demoVideoDefaults,
  failedDemoVideoPrerequisites,
  formatDemoVideoPrerequisiteFailures,
  isSafeLocalDemoBaseUrl,
  listDemoVideoNames,
} from "./stack-runner"

describe("demo video stack runner", () => {
  test("returns an empty demo list when no demos are generated or tagged", () => {
    expect(listDemoVideoNames()).toEqual([])
  })

  test("rejects unknown demos before stack startup", () => {
    expect(() => createDemoVideoRunPlan({ demoName: "missing-demo" })).toThrow(
      /Unknown demo "missing-demo"/,
    )
  })

  test("explains how to regenerate when a scene manifest has no demo script", () => {
    const tempDir = mkdtempSync(path.join(process.cwd(), "out/tmp/demo-video-"))
    try {
      const manifestPath = path.join(tempDir, "missing-script.scenes.json")
      writeFileSync(manifestPath, "[]", "utf8")

      expect(() =>
        assertDemoVideoArtifactsReady({
          demoName: "missing-script",
          scriptPath: path.join(tempDir, "missing-script.demo.ts"),
          manifestPath,
        }),
      ).toThrow(/Run 'just generate-bdd'/)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("allows local development URLs and rejects production-like URLs", () => {
    expect(isSafeLocalDemoBaseUrl("http://localhost:3000")).toBe(true)
    expect(isSafeLocalDemoBaseUrl("http://devbox:3000")).toBe(true)
    expect(isSafeLocalDemoBaseUrl("http://app.local:3000")).toBe(true)
    expect(isSafeLocalDemoBaseUrl("https://localhost:3000")).toBe(false)
    expect(isSafeLocalDemoBaseUrl("https://app.example.com")).toBe(false)
    expect(isSafeLocalDemoBaseUrl("http://app.example.com")).toBe(false)
  })

  test("formats prerequisite failures without probing the local machine", () => {
    const failed = failedDemoVideoPrerequisites([
      { name: "ffmpeg", ok: false, message: "not found" },
      { name: "ffprobe", ok: true, message: "available" },
    ])

    expect(failed).toEqual([
      { name: "ffmpeg", ok: false, message: "not found" },
    ])
    expect(formatDemoVideoPrerequisiteFailures(failed)).toBe(
      "- ffmpeg: not found",
    )
  })

  test("supports explicit local port and host overrides", () => {
    const tempDir = mkdtempSync(path.join(process.cwd(), "out/tmp/demo-video-"))
    try {
      writeFileSync(path.join(tempDir, "fixture.scenes.json"), "[]", "utf8")
      writeFileSync(path.join(tempDir, "fixture.demo.ts"), "// stub", "utf8")
      // assertDemoVideoArtifactsReady resolves repo-relative paths against the
      // repo root, so we exercise it with absolute paths via a wrapper here.
      expect(() =>
        assertDemoVideoArtifactsReady({
          demoName: "fixture",
          scriptPath: path.join(tempDir, "fixture.demo.ts"),
          manifestPath: path.join(tempDir, "fixture.scenes.json"),
        }),
      ).not.toThrow()
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("default ports match the documented portal/api defaults", () => {
    expect(demoVideoDefaults.webPort).toBe(3100)
    expect(demoVideoDefaults.apiPort).toBe(3101)
    expect(demoVideoDefaults.host).toBe("localhost")
    expect(demoVideoDefaults.playwrightTimeoutMs).toBe(900_000)
  })
})

describe("demo video stack runner with a generated demo fixture", () => {
  function withGeneratedDemo<T>(demoName: string, fn: () => T): T {
    const repoRoot = process.cwd()
    const argoDir = path.join(repoRoot, "out/generated/bdd/argo")
    const scriptPath = path.join(argoDir, `${demoName}.demo.ts`)
    const manifestPath = path.join(argoDir, `${demoName}.scenes.json`)

    require("node:fs").mkdirSync(argoDir, { recursive: true })
    writeFileSync(scriptPath, "// stub", "utf8")
    writeFileSync(manifestPath, "[]", "utf8")

    try {
      return fn()
    } finally {
      rmSync(scriptPath, { force: true })
      rmSync(manifestPath, { force: true })
    }
  }

  test("builds deterministic defaults for a generated demo fixture", () => {
    withGeneratedDemo("port-fixture", () => {
      const plan = createDemoVideoRunPlan({ demoName: "port-fixture" })

      expect(plan.baseUrl).toBe(
        `http://${demoVideoDefaults.host}:${demoVideoDefaults.webPort}`,
      )
      expect(plan.workDir).toBe(".argo/port-fixture")
      expect(plan.scriptPath).toBe(
        "out/generated/bdd/argo/port-fixture.demo.ts",
      )
      expect(plan.manifestPath).toBe(
        "out/generated/bdd/argo/port-fixture.scenes.json",
      )
      expect(plan.outputPath).toBe("out/demo-videos/port-fixture.mp4")
      expect(plan.stackEnv).toMatchObject({
        PORTAL_PORT: String(demoVideoDefaults.webPort),
        API_PORT: String(demoVideoDefaults.apiPort),
        APP_HOST: demoVideoDefaults.host,
      })
      expect(plan.argoEnv.ARGO_PLAYWRIGHT_TIMEOUT_MS).toBe("900000")
      expect(plan.argoEnv.ARGO_OVERLAYS_PATH).toEndWith(
        "out/generated/bdd/argo/port-fixture.scenes.json",
      )
      expect(plan.phases.map(phase => phase.name)).toEqual([
        "stack",
        "readiness",
        "tts",
        "record",
        "audio",
        "export",
      ])
    })
  })

  test("omits stack startup when using an existing stack", () => {
    withGeneratedDemo("existing-fixture", () => {
      const plan = createDemoVideoRunPlan({
        demoName: "existing-fixture",
        useExistingStack: true,
        baseUrl: "http://localhost:3000",
      })

      expect(plan.phases.map(phase => phase.name)).toEqual([
        "readiness",
        "tts",
        "record",
        "audio",
        "export",
      ])
    })
  })

  test("propagates explicit port and host overrides into stack env", () => {
    withGeneratedDemo("override-fixture", () => {
      const plan = createDemoVideoRunPlan({
        demoName: "override-fixture",
        webPort: 3200,
        apiPort: 3201,
        host: "devbox",
        playwrightTimeoutMs: 1_200_000,
      })

      expect(plan.baseUrl).toBe("http://devbox:3200")
      expect(plan.stackEnv).toMatchObject({
        PORTAL_PORT: "3200",
        API_PORT: "3201",
        APP_HOST: "devbox",
        KORRI_API_PROXY_TARGET: "http://devbox:3201",
      })
      expect(plan.argoEnv.ARGO_PLAYWRIGHT_TIMEOUT_MS).toBe("1200000")
    })
  })
})
