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
    "*/step-definitions/*.steps",
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
  stepDefinitionGlob:
    "korri/products/*/features/**/e2e/step-definitions/*.steps.ts",
  generatedWrapperGlob: "korri/products/*/features/**/e2e/generated/*.e2e.ts",
  generatedDirName: "generated",
  authored: ["*.feature", "step-definitions/*.steps.ts"],
  generated: ["generated/*.e2e.ts"],
} as const

export const BDD_ARCHITECTURE = {
  authoredSources: BDD_AUTHORED_SOURCES,
  generatedWrapperPolicy: BDD_GENERATED_WRAPPER_POLICY,
  runner: BDD_RUNNER_ARCHITECTURE,
  folderConvention: BDD_FOLDER_CONVENTION,
} as const

export type BddArchitecture = typeof BDD_ARCHITECTURE
