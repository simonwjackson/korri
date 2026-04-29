#!/usr/bin/env tsx

import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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

function parseCliArgs(): { tagFilter: string | undefined; cleanOnly: boolean } {
  const args = process.argv.slice(2)
  let tagFilter: string | undefined
  let cleanOnly = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tags" && i + 1 < args.length) {
      tagFilter = args[i + 1]
      i++
    } else if (args[i] === "--clean") {
      cleanOnly = true
    }
  }

  return { tagFilter, cleanOnly }
}

const GENERATED_DIR_NAME = BDD_FOLDER_CONVENTION.generatedDirName
const FEATURE_GLOB = BDD_FOLDER_CONVENTION.featureGlob

const GENERATED_HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Source of truth: {{SOURCE_FEATURE}}
 * Generator:       tools/scripts/generate-bdd-playwright-tests.ts
 *
 * Re-generate:     just generate-bdd
 */
`

function toPosix(path: string): string {
  return path.split("\\").join("/")
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
  const stepDefsDir = join(e2eDir, "step-definitions")
  if (!existsSync(stepDefsDir)) return []

  return readdirSync(stepDefsDir)
    .filter(file => file.endsWith(".steps.ts"))
    .sort((left, right) => left.localeCompare(right))
    .map(file => join(stepDefsDir, file))
}

function formatGeneratedWrapper(filePath: string) {
  const result = spawnSync("biome", ["check", "--write", filePath], {
    encoding: "utf8",
    stdio: "pipe",
  })

  if (result.status !== 0) {
    throw new Error(
      `Failed to format generated wrapper ${toPosix(filePath)}:\n${result.stderr || result.stdout}`,
    )
  }
}

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

function generateWrapperSource(
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

${stepImports}

const feature = parseFeatureFile(${featurePathLiteral})

test.describe(${JSON.stringify(feature.name)}, () => {
  test.describe.configure({ mode: "serial" })

${scenarioTests}})
`
}

function cleanOrphans(): number {
  const generatedDirs = globSync(
    `korri/products/*/features/**/e2e/${GENERATED_DIR_NAME}`,
    { onlyDirectories: true },
  )
  const featureFiles = new Set(globSync(FEATURE_GLOB))

  let removed = 0
  for (const genDir of generatedDirs) {
    const e2eDir = dirname(genDir)
    const hasFeature = [...featureFiles].some(file => dirname(file) === e2eDir)
    if (!hasFeature) {
      for (const file of readdirSync(genDir)) {
        if (file.endsWith(".e2e.ts")) {
          rmSync(join(genDir, file))
          removed++
        }
      }
      console.log(`  orphan cleaned: ${toPosix(genDir)}`)
    }
  }
  return removed
}

function main() {
  const { tagFilter, cleanOnly } = parseCliArgs()

  if (cleanOnly) {
    const orphans = cleanOrphans()
    const allGenerated = globSync(
      `korri/products/*/features/**/e2e/${GENERATED_DIR_NAME}/*.e2e.ts`,
    )
    for (const file of allGenerated) {
      rmSync(file)
    }
    console.log(
      `Cleaned all generated wrappers (${allGenerated.length + orphans} files).`,
    )
    return
  }

  const featureFiles = globSync(FEATURE_GLOB)

  if (tagFilter) {
    console.log(`Tag filter: ${tagFilter}`)
  }

  if (featureFiles.length === 0) {
    console.log("No .feature files found matching:", FEATURE_GLOB)
    return
  }

  const orphansCleaned = cleanOrphans()

  let generated = 0
  let cleaned = 0
  let skippedByTags = 0

  for (const featurePath of featureFiles) {
    const feature = parseFeatureFile(featurePath)
    if (feature.scenarios.length === 0) {
      console.log(`  skip (no scenarios): ${featurePath}`)
      continue
    }

    const scenarioIndices: number[] = []
    for (let i = 0; i < feature.scenarios.length; i++) {
      if (matchesTagFilter(feature.scenarios[i].tags, tagFilter)) {
        scenarioIndices.push(i)
      } else {
        skippedByTags++
      }
    }

    const e2eDir = dirname(featurePath)
    const generatedDir = join(e2eDir, GENERATED_DIR_NAME)

    if (existsSync(generatedDir)) {
      for (const file of readdirSync(generatedDir)) {
        if (file.endsWith(".e2e.ts")) {
          rmSync(join(generatedDir, file))
          cleaned++
        }
      }
    } else {
      mkdirSync(generatedDir, { recursive: true })
    }

    if (scenarioIndices.length === 0) {
      console.log(`  skip (no scenarios match tags): ${featurePath}`)
      continue
    }

    const stem = basename(featurePath, ".feature")
    const generatedFilePath = join(generatedDir, `${stem}.e2e.ts`)
    const stepDefFiles = findStepDefinitionImports(featurePath)
    const source = generateWrapperSource(
      feature,
      generatedFilePath,
      stepDefFiles,
      scenarioIndices,
    )

    writeFileSync(generatedFilePath, source, "utf-8")
    formatGeneratedWrapper(generatedFilePath)
    generated++

    console.log(
      `  ✓ ${toPosix(generatedFilePath)} (${scenarioIndices.length}/${feature.scenarios.length} scenarios, ${stepDefFiles.length} step files)`,
    )
  }

  console.log("")
  const totalCleaned = cleaned + orphansCleaned
  const parts = [
    `Generated ${generated} wrapper(s)`,
    `cleaned ${totalCleaned} stale file(s)`,
  ]
  if (skippedByTags > 0) {
    parts.push(`${skippedByTags} scenario(s) excluded by tag filter`)
  }
  console.log(`Done. ${parts.join(", ")}.`)
}

main()
