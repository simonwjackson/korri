import { describe, expect, test } from "bun:test"
import type { ParsedFeature } from "../testing/bdd/parser"
import {
  generatedWrapperPathForFeature,
  generateWrapperSource,
} from "./generate-bdd-playwright-tests"

const feature: ParsedFeature = {
  name: "Safe game resume",
  tags: [],
  sourcePath: "korri/products/app/features/resume/e2e/safe-game-resume.feature",
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
        "korri/products/app/features/resume/e2e/safe-game-resume.feature",
      ),
    ).toBe(
      "out/generated/bdd/playwright/korri/products/app/features/resume/e2e/safe-game-resume.e2e.ts",
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
      ["korri/products/app/features/resume/e2e/safe-game-resume.steps.ts"],
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
