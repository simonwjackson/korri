/**
 * Canonical BDD architecture contract for Korri end-to-end testing.
 *
 * - `.feature` files are the authored business-specification source of truth.
 * - flat `<name>.steps.ts` files beside the feature own browser automation.
 * - optional `e2e/<demo-name>.demo.yaml` storyboards are authored
 *   presentation metadata for BDD-derived Argo demos; they must not define
 *   behavior.
 * - `tools/testing/bdd/shared-steps.ts` provides repo-wide shared steps and
 *   is auto-imported by every generated wrapper.
 * - generated Playwright `*.e2e.ts` wrappers live under
 *   `out/generated/bdd/playwright/` and are non-authored, disposable adapters.
 * - generated Argo `out/generated/bdd/argo/*.demo.ts` adapters execute tagged
 *   `@demo(<name>)` scenarios through the same BDD runtime.
 */

export const BDD_AUTHORED_SOURCES = {
  featureFiles: true,
  stepDefinitions: true,
  demoStoryboards: true,
  generatedWrappers: false,
  generatedArgoDemoAdapters: false,
} as const

/**
 * Contract for generated Argo demo adapter files.
 *
 * These bridge a tagged BDD scenario into Argo recording. They may add
 * recording, narration, and overlay timing around BDD steps, but they must
 * not duplicate browser behavior from step definitions.
 */
export const BDD_GENERATED_ARGO_DEMO_POLICY = {
  handEdited: false,
  disposable: true,
  ownsScenarioLogic: false,
  behaviorSource: ["*.feature", "*.steps.ts"],
  presentationSource: ["*.demo.yaml"],
  generatedArtifacts: [
    "out/generated/bdd/argo/*.demo.ts",
    "out/generated/bdd/argo/*.scenes.json",
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
    "argo-recording",
    "narration-timing",
    "overlay-timing",
    "bdd-scenario-execution",
  ],
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
  featureGlob: "product/apps/*/features/**/e2e/*.feature",
  stepDefinitionGlob: "product/apps/*/features/**/e2e/*.steps.ts",
  demoStoryboardGlob: "product/apps/*/features/**/e2e/*.demo.yaml",
  generatedWrapperRoot: "out/generated/bdd/playwright",
  generatedWrapperGlob:
    "out/generated/bdd/playwright/product/apps/*/features/**/e2e/*.e2e.ts",
  legacyGeneratedWrapperGlob:
    "product/apps/*/features/**/e2e/generated/*.e2e.ts",
  authored: ["*.feature", "*.steps.ts", "*.demo.yaml"],
  generatedArgoDemoGlob: "out/generated/bdd/argo/*.demo.ts",
  generatedArgoSceneGlob: "out/generated/bdd/argo/*.scenes.json",
  generated: [
    "out/generated/bdd/playwright/**/*.e2e.ts",
    "out/generated/bdd/argo/*.demo.ts",
    "out/generated/bdd/argo/*.scenes.json",
  ],
} as const

export const BDD_ARCHITECTURE = {
  authoredSources: BDD_AUTHORED_SOURCES,
  generatedWrapperPolicy: BDD_GENERATED_WRAPPER_POLICY,
  generatedArgoDemoPolicy: BDD_GENERATED_ARGO_DEMO_POLICY,
  runner: BDD_RUNNER_ARCHITECTURE,
  folderConvention: BDD_FOLDER_CONVENTION,
} as const

export type BddArchitecture = typeof BDD_ARCHITECTURE
