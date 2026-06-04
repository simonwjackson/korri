import { describe, expect, test } from "bun:test"
import type { DemoStoryboard } from "../testing/bdd/demo-storyboard"
import type { ParsedFeature } from "../testing/bdd/parser"
import {
  collectDemoScenarios,
  type FeatureGenerationInput,
  findUnmatchedDemoStoryboards,
  generateDemoAdapterSources,
  generatedWrapperPathForFeature,
  generateWrapperSource,
} from "./generate-bdd-playwright-tests"

const feature: ParsedFeature = {
  name: "Safe game resume",
  tags: [],
  sourcePath:
    "product/apps/portal/features/resume/e2e/safe-game-resume.feature",
  scenarios: [
    {
      name: "Previous game is offered as the primary continuation action",
      tags: ["@SGR-O2"],
      steps: [
        { text: "I open the launcher", argument: undefined },
        {
          text: '"Hades" should be the primary continue action',
          argument: undefined,
        },
      ],
    },
  ],
}

describe("BDD Playwright wrapper generation", () => {
  test("emits wrappers under out/generated/bdd/playwright", () => {
    expect(
      generatedWrapperPathForFeature(
        "product/apps/portal/features/resume/e2e/safe-game-resume.feature",
      ),
    ).toBe(
      "out/generated/bdd/playwright/product/apps/portal/features/resume/e2e/safe-game-resume.e2e.ts",
    )
  })

  test("auto-imports the shared step registry", () => {
    const generatedPath = generatedWrapperPathForFeature(feature.sourcePath)
    const source = generateWrapperSource(feature, generatedPath, [], [0])

    expect(source).toContain("/tools/testing/bdd/shared-steps")
    expect(source).toContain("/tools/testing/bdd/world")
    expect(source).toContain("/tools/testing/bdd/resolver")
    expect(source).toContain("/tools/testing/bdd/parser")
    expect(source).toContain('test.describe("Safe game resume"')
    expect(source).toContain("executeScenario(world, feature.scenarios[0])")
  })

  test("imports flat feature step files when present", () => {
    const generatedPath = generatedWrapperPathForFeature(feature.sourcePath)
    const source = generateWrapperSource(
      feature,
      generatedPath,
      ["product/apps/portal/features/resume/e2e/safe-game-resume.steps.ts"],
      [0],
    )

    expect(source).toContain("/safe-game-resume.steps")
  })

  test("does not embed direct browser behavior", () => {
    const generatedPath = generatedWrapperPathForFeature(feature.sourcePath)
    const source = generateWrapperSource(feature, generatedPath, [], [0])

    expect(source).not.toMatch(
      /page\.goto|page\.locator|getByRole|getByText|expect\(/,
    )
  })
})

const demoFeature: ParsedFeature = {
  name: "Launcher overview",
  tags: [],
  sourcePath:
    "product/apps/portal/features/launcher/e2e/launcher-overview.feature",
  scenarios: [
    {
      name: "User opens the launcher and sees their library",
      tags: ["@demo(launcher-overview)"],
      steps: [
        {
          text: "the launcher data is reset to seed state",
          argument: undefined,
        },
        { text: 'I open "/"', argument: undefined },
        {
          text: 'I should see "Library"',
          argument: undefined,
        },
      ],
    },
  ],
}

const storyboard: DemoStoryboard = {
  demo: "launcher-overview",
  sourcePath:
    "product/apps/portal/features/launcher/e2e/launcher-overview.demo.yaml",
  recording: { start: "after-step-1" },
  scenes: [
    {
      anchor: "after-step-1",
      scene: "welcome",
      text: "Korri loads your library from a local seed.",
      durationMs: 7900,
      overlay: {
        type: "headline-card",
        title: "Reproducible from seed data",
      },
    },
  ],
}

describe("BDD generator Argo adapters", () => {
  test("generates a demo adapter that delegates behavior to BDD steps", () => {
    const sources = generateDemoAdapterSources({
      demoName: "launcher-overview",
      feature: demoFeature,
      scenarioIndex: 0,
      generatedFilePath: "out/generated/bdd/argo/launcher-overview.demo.ts",
      stepDefFiles: [
        "product/apps/portal/features/launcher/e2e/launcher-overview.steps.ts",
      ],
      storyboard,
    })

    expect(sources.scriptSource).toContain("executeScenarioWithCallbacks")
    expect(sources.scriptSource).toContain("world.attachToPage(page)")
    expect(sources.scriptSource).toContain("cursorHighlight(page")
    expect(sources.scriptSource).toContain("after-step-1")
    expect(sources.scriptSource).toContain("shared-steps")
    expect(sources.scriptSource).not.toMatch(
      /page\.goto|page\.locator|getByRole|getByText|expect\(/,
    )

    const manifest = JSON.parse(sources.scenesJson) as Array<{
      scene: string
      text: string
      overlay: Record<string, unknown>
    }>
    expect(manifest).toEqual([
      {
        scene: "welcome",
        text: "Korri loads your library from a local seed.",
        overlay: {
          type: "headline-card",
          title: "Reproducible from seed data",
        },
      },
    ])
  })

  test("generates a minimal default scene when storyboard YAML is absent", () => {
    const sources = generateDemoAdapterSources({
      demoName: "default-demo",
      feature: demoFeature,
      scenarioIndex: 0,
      generatedFilePath: "out/generated/bdd/argo/default-demo.demo.ts",
      stepDefFiles: [],
      storyboard: {
        demo: "default-demo",
        sourcePath: undefined,
        recording: { start: undefined },
        scenes: [],
      },
    })

    expect(sources.scenes).toEqual([
      expect.objectContaining({
        anchor: "before-step-1",
        scene: "scenario",
        text: "User opens the launcher and sees their library",
      }),
    ])
    expect(sources.scriptSource).toContain(
      'const recordingStartAnchor = "before-step-1"',
    )
  })

  test("rejects duplicate demo tags before generation", () => {
    const input: FeatureGenerationInput = {
      featurePath:
        "product/apps/portal/features/launcher/e2e/launcher-overview.feature",
      feature: demoFeature,
      scenarioIndices: [0],
      stepDefFiles: [],
      generatedFilePath: generatedWrapperPathForFeature(demoFeature.sourcePath),
    }

    expect(() => collectDemoScenarios([input, input])).toThrow(
      /Duplicate @demo\(launcher-overview\)/,
    )
  })

  test("finds storyboard YAML without matching demo tags", () => {
    expect(
      findUnmatchedDemoStoryboards(
        [
          "product/apps/portal/features/launcher/e2e/launcher-overview.demo.yaml",
          "product/apps/portal/features/home/e2e/stale.demo.yaml",
        ],
        [
          "product/apps/portal/features/launcher/e2e/launcher-overview.demo.yaml",
        ],
      ),
    ).toEqual(["product/apps/portal/features/home/e2e/stale.demo.yaml"])
  })

  test("rejects storyboard anchors that no longer match the scenario", () => {
    expect(() =>
      generateDemoAdapterSources({
        demoName: "launcher-overview",
        feature: demoFeature,
        scenarioIndex: 0,
        generatedFilePath: "out/generated/bdd/argo/launcher-overview.demo.ts",
        stepDefFiles: [],
        storyboard: {
          ...storyboard,
          scenes: [{ ...storyboard.scenes[0], anchor: "after-step-99" }],
        },
      }),
    ).toThrow(/after-step-99.*has 3 step/)
  })
})
