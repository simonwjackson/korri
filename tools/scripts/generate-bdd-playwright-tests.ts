#!/usr/bin/env tsx
/**
 * BDD → Playwright wrapper generator.
 *
 * Scans authored `.feature` files and emits thin Playwright wrappers under
 * `out/generated/bdd/playwright/`. Each wrapper imports shared steps and any
 * flat feature-local `<name>.steps.ts` files beside the feature.
 *
 * Generated files are disposable adapters — never hand-edit them.
 * See `tools/testing/bdd/architecture.ts` for the architecture contract.
 *
 * Usage:
 *   bun run tools/scripts/generate-bdd-playwright-tests.ts
 *   bun run tools/scripts/generate-bdd-playwright-tests.ts --tags "@smoke"
 *   bun run tools/scripts/generate-bdd-playwright-tests.ts --tags "not @fixme"
 *   bun run tools/scripts/generate-bdd-playwright-tests.ts --check
 *   bun run tools/scripts/generate-bdd-playwright-tests.ts --clean
 */

import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative } from "node:path"
import { globSync } from "fast-glob"
import { BDD_FOLDER_CONVENTION } from "../testing/bdd/architecture"
import {
  type ParsedFeature,
  type ParsedScenario,
  parseFeatureFile,
} from "../testing/bdd/parser"
import {
  generateAnnotationLines,
  isOnlyScenario,
  matchesTagFilter,
} from "../testing/bdd/tags"

const GENERATED_WRAPPER_ROOT = BDD_FOLDER_CONVENTION.generatedWrapperRoot
const FEATURE_GLOB = BDD_FOLDER_CONVENTION.featureGlob
const LEGACY_GENERATED_GLOB = BDD_FOLDER_CONVENTION.legacyGeneratedWrapperGlob

const GENERATED_HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Source of truth: {{SOURCE_FEATURE}}
 * Generator:       tools/scripts/generate-bdd-playwright-tests.ts
 *
 * Re-generate:     just generate-bdd
 */
`

// ── Types ────────────────────────────────────────────────────────────

export type FeatureGenerationInput = {
  featurePath: string
  feature: ParsedFeature
  scenarioIndices: number[]
  stepDefFiles: string[]
  generatedFilePath: string
}

type GeneratedFile = {
  path: string
  source: string
}

type GeneratedFileCheck = {
  checked: number
  missing: string[]
  changed: string[]
  extra: string[]
}

// ── CLI args ─────────────────────────────────────────────────────────

function parseCliArgs(): {
  tagFilter: string | undefined
  cleanOnly: boolean
  checkOnly: boolean
} {
  const args = process.argv.slice(2)
  let tagFilter: string | undefined
  let cleanOnly = false
  let checkOnly = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tags" && i + 1 < args.length) {
      tagFilter = args[i + 1]
      i++
    } else if (args[i] === "--clean") {
      cleanOnly = true
    } else if (args[i] === "--check") {
      checkOnly = true
    }
  }

  return { tagFilter, cleanOnly, checkOnly }
}

// ── Helpers ──────────────────────────────────────────────────────────

function toPosix(value: string): string {
  return value.split("\\").join("/")
}

function relativeImport(fromFile: string, toModule: string): string {
  const rel = toPosix(relative(dirname(fromFile), toModule))
  return rel.startsWith(".") ? rel : `./${rel}`
}

function testTitle(featureName: string, scenarioName: string): string {
  return `${featureName} / ${scenarioName}`
}

function findStepDefinitionImports(featurePath: string): string[] {
  const e2eDir = dirname(featurePath)
  if (!existsSync(e2eDir)) return []

  return readdirSync(e2eDir)
    .filter(file => file.endsWith(".steps.ts"))
    .sort((left, right) => left.localeCompare(right))
    .map(file => join(e2eDir, file))
}

export function generatedWrapperPathForFeature(featurePath: string): string {
  const stem = basename(featurePath, ".feature")
  return join(GENERATED_WRAPPER_ROOT, dirname(featurePath), `${stem}.e2e.ts`)
}

function formatGeneratedFile(filePath: string) {
  const result = spawnSync("bunx", ["biome", "check", "--write", filePath], {
    encoding: "utf8",
    stdio: "pipe",
  })

  if (result.status !== 0) {
    throw new Error(
      `Failed to format generated file ${toPosix(filePath)}:\n${result.stderr || result.stdout}`,
    )
  }
}

function formatGeneratedSource(filePath: string, source: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "korri-bdd-format-"))
  const tempFile = join(tempDir, basename(filePath))

  try {
    writeFileSync(tempFile, source, "utf-8")
    formatGeneratedFile(tempFile)
    return readFileSync(tempFile, "utf-8")
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

// ── Wrapper source generation ────────────────────────────────────────

function generateScenarioTest(
  scenario: ParsedScenario,
  featureName: string,
  scenarioIndex: number,
): string {
  const title = testTitle(featureName, scenario.name)
  const testFn = isOnlyScenario(scenario.tags) ? "test.only" : "test"
  const annotationLines = generateAnnotationLines(scenario.tags)
  const annotationCode =
    annotationLines.length > 0
      ? `${annotationLines.map(line => `    ${line}`).join("\n")}\n`
      : ""

  return `  ${testFn}(${JSON.stringify(title)}, async ({ browser }) => {
${annotationCode}    const world = new BddWorld()
    world.resetState()
    await world.setup(browser)

    try {
      await executeScenario(world, feature.scenarios[${scenarioIndex}])
    } finally {
      await world.teardown()
    }
  })
`
}

export function generateWrapperSource(
  feature: ParsedFeature,
  generatedFilePath: string,
  stepDefFiles: string[],
  scenarioIndices: number[],
): string {
  const bddDir = join("tools", "testing", "bdd")
  const worldImport = relativeImport(generatedFilePath, join(bddDir, "world"))
  const resolverImport = relativeImport(
    generatedFilePath,
    join(bddDir, "resolver"),
  )
  const parserImport = relativeImport(generatedFilePath, join(bddDir, "parser"))
  const sharedStepsImport = relativeImport(
    generatedFilePath,
    join(bddDir, "shared-steps"),
  )

  const header = GENERATED_HEADER.replace(
    "{{SOURCE_FEATURE}}",
    toPosix(feature.sourcePath),
  )

  const stepImports = stepDefFiles
    .map(file => {
      const imp = relativeImport(generatedFilePath, file.replace(/\.ts$/, ""))
      return `import ${JSON.stringify(imp)}`
    })
    .join("\n")

  const featurePathLiteral = JSON.stringify(toPosix(feature.sourcePath))
  const scenarioTests = scenarioIndices
    .map(index =>
      generateScenarioTest(feature.scenarios[index], feature.name, index),
    )
    .join("\n")

  return `${header}
import { test } from "@playwright/test"
import { BddWorld } from ${JSON.stringify(worldImport)}
import { executeScenario } from ${JSON.stringify(resolverImport)}
import { parseFeatureFile } from ${JSON.stringify(parserImport)}

import ${JSON.stringify(sharedStepsImport)}
${stepImports ? `${stepImports}\n` : ""}
const feature = parseFeatureFile(${featurePathLiteral})

test.describe(${JSON.stringify(feature.name)}, () => {
  test.describe.configure({ mode: "serial" })

${scenarioTests}})
`
}

// ── Pipeline ─────────────────────────────────────────────────────────

function collectFeatureGenerationInputs(
  featureFiles: ReadonlyArray<string>,
  tagFilter: string | undefined,
): { features: FeatureGenerationInput[]; skippedByTags: number } {
  let skippedByTags = 0

  const features = featureFiles.map(featurePath => {
    const feature = parseFeatureFile(featurePath)
    const scenarioIndices: number[] = []
    for (let i = 0; i < feature.scenarios.length; i++) {
      if (matchesTagFilter(feature.scenarios[i].tags, tagFilter)) {
        scenarioIndices.push(i)
      } else {
        skippedByTags++
      }
    }

    return {
      featurePath,
      feature,
      scenarioIndices,
      stepDefFiles: findStepDefinitionImports(featurePath),
      generatedFilePath: generatedWrapperPathForFeature(featurePath),
    }
  })

  return { features, skippedByTags }
}

function buildGeneratedFiles(
  features: ReadonlyArray<FeatureGenerationInput>,
): GeneratedFile[] {
  const files: GeneratedFile[] = []

  for (const input of features) {
    if (input.feature.scenarios.length === 0) continue
    if (input.scenarioIndices.length === 0) continue

    const source = generateWrapperSource(
      input.feature,
      input.generatedFilePath,
      input.stepDefFiles,
      input.scenarioIndices,
    )
    files.push({
      path: input.generatedFilePath,
      source: formatGeneratedSource(input.generatedFilePath, source),
    })
  }

  return files
}

// ── Cleanup ──────────────────────────────────────────────────────────

function cleanGeneratedWrappers(): number {
  const generatedFiles = globSync(`${GENERATED_WRAPPER_ROOT}/**/*.e2e.ts`)
  if (existsSync(GENERATED_WRAPPER_ROOT)) {
    rmSync(GENERATED_WRAPPER_ROOT, { recursive: true, force: true })
  }
  return generatedFiles.length
}

function cleanLegacyCoLocatedWrappers(): number {
  const legacyFiles = globSync(LEGACY_GENERATED_GLOB)
  let removed = 0

  for (const file of legacyFiles) {
    const source = readFileSync(file, "utf8")
    if (
      !source.includes("AUTO-GENERATED") ||
      !source.includes("generate-bdd-playwright-tests.ts")
    ) {
      continue
    }
    rmSync(file)
    removed++
  }

  const legacyDirs = globSync("korri/products/*/features/**/e2e/generated", {
    onlyDirectories: true,
  })
  for (const dir of legacyDirs) {
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true })
    }
  }

  return removed
}

// ── Check mode ───────────────────────────────────────────────────────

function checkGeneratedFiles(
  expectedFiles: ReadonlyArray<GeneratedFile>,
  options: { allowExtra?: boolean; compareExisting?: boolean } = {},
): GeneratedFileCheck {
  const expectedPaths = new Set(expectedFiles.map(file => toPosix(file.path)))
  const result: GeneratedFileCheck = {
    checked: expectedFiles.length,
    missing: [],
    changed: [],
    extra: [],
  }

  if (options.compareExisting === false) return result
  if (!existsSync(GENERATED_WRAPPER_ROOT)) {
    if (expectedFiles.length > 0) {
      result.missing.push(...expectedFiles.map(file => toPosix(file.path)))
    }
    return result
  }

  for (const expectedFile of expectedFiles) {
    if (!existsSync(expectedFile.path)) {
      result.missing.push(toPosix(expectedFile.path))
      continue
    }
    const actualSource = readFileSync(expectedFile.path, "utf-8")
    if (actualSource !== expectedFile.source) {
      result.changed.push(toPosix(expectedFile.path))
    }
  }

  if (!options.allowExtra) {
    const generatedFiles = globSync(`${GENERATED_WRAPPER_ROOT}/**/*.e2e.ts`)
    for (const generatedFile of generatedFiles) {
      if (!expectedPaths.has(toPosix(generatedFile))) {
        result.extra.push(toPosix(generatedFile))
      }
    }
  }

  return result
}

function reportGeneratedFileCheck(result: GeneratedFileCheck): void {
  if (
    result.missing.length === 0 &&
    result.changed.length === 0 &&
    result.extra.length === 0
  ) {
    console.log(`BDD generation check passed (${result.checked} file(s)).`)
    return
  }

  const lines = ["BDD generated artifacts are stale."]
  if (result.missing.length > 0) {
    lines.push(
      "",
      "Missing generated files:",
      ...result.missing.map(file => `  - ${file}`),
    )
  }
  if (result.changed.length > 0) {
    lines.push(
      "",
      "Changed generated files:",
      ...result.changed.map(file => `  - ${file}`),
    )
  }
  if (result.extra.length > 0) {
    lines.push(
      "",
      "Extra generated files:",
      ...result.extra.map(file => `  - ${file}`),
    )
  }
  lines.push("", "Run `just generate-bdd` to refresh generated artifacts.")

  throw new Error(lines.join("\n"))
}

// ── Write ────────────────────────────────────────────────────────────

function writeGeneratedFiles(
  expectedFiles: ReadonlyArray<GeneratedFile>,
): number {
  for (const file of expectedFiles) {
    mkdirSync(dirname(file.path), { recursive: true })
    writeFileSync(file.path, file.source, "utf-8")
  }
  return expectedFiles.length
}

// ── Main ─────────────────────────────────────────────────────────────

export function main() {
  const { tagFilter, cleanOnly, checkOnly } = parseCliArgs()

  if (cleanOnly) {
    const wrappers = cleanGeneratedWrappers()
    const legacy = cleanLegacyCoLocatedWrappers()
    console.log(`Cleaned all generated wrappers (${wrappers + legacy} files).`)
    return
  }

  const featureFiles = globSync(FEATURE_GLOB).sort()

  if (tagFilter) {
    console.log(`Tag filter: ${tagFilter}`)
  }

  if (featureFiles.length === 0) {
    console.log("No .feature files found matching:", FEATURE_GLOB)
    return
  }

  const { features, skippedByTags } = collectFeatureGenerationInputs(
    featureFiles,
    tagFilter,
  )
  const expectedFiles = buildGeneratedFiles(features)

  if (checkOnly) {
    reportGeneratedFileCheck(
      checkGeneratedFiles(expectedFiles, {
        allowExtra: Boolean(tagFilter),
        compareExisting: !tagFilter,
      }),
    )
    return
  }

  const wrappersCleaned = cleanGeneratedWrappers()
  const legacyCleaned = cleanLegacyCoLocatedWrappers()
  const generated = writeGeneratedFiles(expectedFiles)

  for (const file of expectedFiles) {
    console.log(`  ✓ ${toPosix(file.path)}`)
  }

  console.log("")
  const totalCleaned = wrappersCleaned + legacyCleaned
  const parts = [
    `Generated ${generated} wrapper(s)`,
    `cleaned ${totalCleaned} stale file(s)`,
  ]
  if (skippedByTags > 0) {
    parts.push(`${skippedByTags} scenario(s) excluded by tag filter`)
  }
  console.log(`Done. ${parts.join(", ")}.`)
}

if (import.meta.main) {
  main()
}
