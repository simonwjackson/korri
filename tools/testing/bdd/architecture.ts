/**
 * Canonical BDD architecture contract for Korri end-to-end testing.
 *
 * - `.feature` files are the authored business-specification source of truth.
 * - flat `<name>.steps.ts` files beside the feature own browser automation.
 * - `tools/testing/bdd/shared-steps.ts` provides repo-wide shared steps and
 *   is auto-imported by every generated wrapper.
 * - generated Playwright `*.e2e.ts` wrappers live under
 *   `out/generated/bdd/playwright/` and are non-authored, disposable adapters.
 */

export const BDD_AUTHORED_SOURCES = {
  featureFiles: true,
  stepDefinitions: true,
  generatedWrappers: false,
} as const

export const BDD_GENERATED_WRAPPER_POLICY = {
  handEdited: false,
  disposable: true,
  ownsScenarioLogic: false,
  allowedImports: [
    "@playwright/test",
    "*/tools/testing/bdd/world",
    "*/tools/testing/bdd/resolver",
    "*/tools/testing/bdd/parser",
    "*/tools/testing/bdd/shared-steps",
    "*/e2e/*.steps",
  ],
  forbiddenContent: [
    "expect(",
    "page.locator",
    "page.getByRole",
    "page.getByText",
    "page.goto",
    "page.click",
    "page.fill",
  ],
  purpose: [
    "playwright-discovery",
    "playwright-execution",
    "playwright-ui-mode",
    "trace-capture",
    "screenshot-capture",
    "scenario-display",
  ],
} as const

export const BDD_RUNNER_ARCHITECTURE = {
  primaryRunner: "playwright",
  browserAutomationEngine: "playwright",
  scenarioSource: "gherkin-feature-files",
  executableMappingSource: "step-definitions",
  wrapperRole: "generated-adapter",
} as const

export const BDD_FOLDER_CONVENTION = {
  featureGlob: "korri/products/*/features/**/e2e/*.feature",
  stepDefinitionGlob: "korri/products/*/features/**/e2e/*.steps.ts",
  generatedWrapperRoot: "out/generated/bdd/playwright",
  generatedWrapperGlob:
    "out/generated/bdd/playwright/korri/products/*/features/**/e2e/*.e2e.ts",
  legacyGeneratedWrapperGlob:
    "korri/products/*/features/**/e2e/generated/*.e2e.ts",
  authored: ["*.feature", "*.steps.ts"],
  generated: ["out/generated/bdd/playwright/**/*.e2e.ts"],
} as const

export const BDD_ARCHITECTURE = {
  authoredSources: BDD_AUTHORED_SOURCES,
  generatedWrapperPolicy: BDD_GENERATED_WRAPPER_POLICY,
  runner: BDD_RUNNER_ARCHITECTURE,
  folderConvention: BDD_FOLDER_CONVENTION,
} as const

export type BddArchitecture = typeof BDD_ARCHITECTURE
