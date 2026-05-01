#!/usr/bin/env tsx
/**
 * BDD → Playwright wrapper generator.
 *
 * Scans authored `.feature` files and emits thin Playwright wrappers under
 * `out/generated/bdd/playwright/`. Each wrapper imports shared steps and any
 * flat feature-local `<name>.steps.ts` files beside the feature.
 *
 * Scenarios tagged with `@demo(<name>)` also emit generated Argo demo
 * adapters under `out/generated/bdd/argo/`. The `.feature` file remains the
 * behavioral source of truth; optional `e2e/<demo-name>.demo.yaml` files
 * provide narration and overlay metadata only.
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
import { generatedArtifactPaths } from "../artifacts/paths"
import { BDD_FOLDER_CONVENTION } from "../testing/bdd/architecture"
import {
  type DemoSceneAnchor,
  type DemoStoryboard,
  demoSceneAnchorStepNumber,
  demoSceneAnchorTiming,
  loadDemoStoryboard,
} from "../testing/bdd/demo-storyboard"
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
const DEMO_STORYBOARD_GLOB = BDD_FOLDER_CONVENTION.demoStoryboardGlob
const DEMO_DUMPS_DIR = generatedArtifactPaths.bddArgo
const DEFAULT_DEMO_SCENE_DURATION_MS = 4_000

const GENERATED_HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Source of truth: {{SOURCE_FEATURE}}
 * Generator:       tools/scripts/generate-bdd-playwright-tests.ts
 *
 * Re-generate:     just generate-bdd
 */
`

const GENERATED_DEMO_HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Source feature:  {{SOURCE_FEATURE}}
 * Source story:    {{SOURCE_STORYBOARD}}
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

type DemoScenarioInput = {
  demoName: string
  featurePath: string
  feature: ParsedFeature
  scenario: ParsedScenario
  scenarioIndex: number
  stepDefFiles: string[]
  storyboardPath: string
}

export type GeneratedDemoScene = {
  anchor: `before-step-${number}` | `after-step-${number}`
  scene: string
  text: string
  durationMs: number
  overlay: Record<string, unknown>
}

export type DemoAdapterSources = {
  scriptSource: string
  scenesJson: string
  scenes: GeneratedDemoScene[]
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
  demoScenarios: ReadonlyArray<DemoScenarioInput>,
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

  for (const demoScenario of demoScenarios) {
    const storyboard = loadDemoStoryboard(
      demoScenario.storyboardPath,
      demoScenario.demoName,
    )
    const generatedFilePath = join(
      DEMO_DUMPS_DIR,
      `${demoScenario.demoName}.demo.ts`,
    )
    const scenesFilePath = join(
      DEMO_DUMPS_DIR,
      `${demoScenario.demoName}.scenes.json`,
    )
    const sources = generateDemoAdapterSources({
      demoName: demoScenario.demoName,
      feature: demoScenario.feature,
      scenarioIndex: demoScenario.scenarioIndex,
      generatedFilePath,
      stepDefFiles: demoScenario.stepDefFiles,
      storyboard,
    })

    files.push({
      path: generatedFilePath,
      source: formatGeneratedSource(generatedFilePath, sources.scriptSource),
    })
    files.push({
      path: scenesFilePath,
      source: formatGeneratedSource(scenesFilePath, sources.scenesJson),
    })
  }

  return files
}

// ── Argo demo adapter generation ─────────────────────────────────────

function findDemoTags(tags: ReadonlyArray<string>): string[] {
  return tags
    .map(tag => tag.match(/^@demo\(([^)]+)\)$/i)?.[1])
    .filter((tag): tag is string => Boolean(tag))
}

function validateDemoName(demoName: string, sourcePath: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(demoName)) {
    throw new Error(
      `Invalid @demo name "${demoName}" in ${sourcePath}: only letters, numbers, hyphens, and underscores are allowed.`,
    )
  }
}

export function collectDemoScenarios(
  features: ReadonlyArray<FeatureGenerationInput>,
): DemoScenarioInput[] {
  const demoScenarios: DemoScenarioInput[] = []
  const seen = new Map<string, DemoScenarioInput>()

  for (const input of features) {
    for (const scenarioIndex of input.scenarioIndices) {
      const scenario = input.feature.scenarios[scenarioIndex]
      const demoTags = findDemoTags(scenario.tags)
      if (demoTags.length === 0) continue
      if (demoTags.length > 1) {
        throw new Error(
          `Scenario "${scenario.name}" in ${input.featurePath} has multiple @demo tags: ${demoTags.join(", ")}`,
        )
      }

      const demoName = demoTags[0]
      validateDemoName(demoName, input.featurePath)
      const storyboardPath = join(
        dirname(input.featurePath),
        `${demoName}.demo.yaml`,
      )
      const demoScenario: DemoScenarioInput = {
        demoName,
        featurePath: input.featurePath,
        feature: input.feature,
        scenario,
        scenarioIndex,
        stepDefFiles: input.stepDefFiles,
        storyboardPath,
      }

      const duplicate = seen.get(demoName)
      if (duplicate) {
        throw new Error(
          `Duplicate @demo(${demoName}) scenarios found:\n` +
            `- ${duplicate.featurePath}: ${duplicate.scenario.name}\n` +
            `- ${input.featurePath}: ${scenario.name}`,
        )
      }

      seen.set(demoName, demoScenario)
      demoScenarios.push(demoScenario)
    }
  }

  return demoScenarios
}

export function findUnmatchedDemoStoryboards(
  storyboardPaths: ReadonlyArray<string>,
  expectedStoryboardPaths: ReadonlyArray<string>,
): string[] {
  const expected = new Set(expectedStoryboardPaths.map(toPosix))
  return storyboardPaths.map(toPosix).filter(path => !expected.has(path))
}

function normalizeAnchor(
  anchor: DemoSceneAnchor,
): GeneratedDemoScene["anchor"] {
  const stepNumber = demoSceneAnchorStepNumber(anchor)
  const timing = demoSceneAnchorTiming(anchor)
  return `${timing}-step-${stepNumber}`
}

function buildDefaultOverlay(text: string): Record<string, unknown> {
  return {
    type: "callout",
    text,
    placement: "bottom-center",
    motion: "fade-in",
    autoBackground: true,
  }
}

function buildDemoScenes(
  scenario: ParsedScenario,
  storyboard: DemoStoryboard,
): GeneratedDemoScene[] {
  if (storyboard.scenes.length === 0) {
    return [
      {
        anchor: "before-step-1",
        scene: "scenario",
        text: scenario.name,
        durationMs: DEFAULT_DEMO_SCENE_DURATION_MS,
        overlay: buildDefaultOverlay(scenario.name),
      },
    ]
  }

  const scenes = storyboard.scenes.map(scene => ({
    anchor: normalizeAnchor(scene.anchor),
    scene: scene.scene,
    text: scene.text,
    durationMs: scene.durationMs ?? DEFAULT_DEMO_SCENE_DURATION_MS,
    overlay: scene.overlay ?? buildDefaultOverlay(scene.text),
  }))

  scenes.sort((left, right) => {
    const leftStep = demoSceneAnchorStepNumber(left.anchor)
    const rightStep = demoSceneAnchorStepNumber(right.anchor)
    if (leftStep !== rightStep) return leftStep - rightStep
    if (
      left.anchor.startsWith("before-") &&
      right.anchor.startsWith("after-")
    ) {
      return -1
    }
    if (
      left.anchor.startsWith("after-") &&
      right.anchor.startsWith("before-")
    ) {
      return 1
    }
    return left.scene.localeCompare(right.scene)
  })

  return scenes
}

function validateDemoScenes(
  demoName: string,
  scenario: ParsedScenario,
  storyboard: DemoStoryboard,
  scenes: ReadonlyArray<GeneratedDemoScene>,
): void {
  const sceneNames = new Set<string>()
  const anchors = new Set<string>()

  const validateAnchor = (anchor: DemoSceneAnchor, label: string) => {
    const stepNumber = demoSceneAnchorStepNumber(anchor)
    if (stepNumber < 1 || stepNumber > scenario.steps.length) {
      throw new Error(
        `Demo ${demoName} ${label} references ${anchor}, but scenario "${scenario.name}" has ${scenario.steps.length} step(s).`,
      )
    }
  }

  if (storyboard.recording.start) {
    validateAnchor(storyboard.recording.start, "recording.start")
  }

  for (const scene of scenes) {
    validateAnchor(scene.anchor, `scene "${scene.scene}"`)
    if (sceneNames.has(scene.scene)) {
      throw new Error(`Demo ${demoName} has duplicate scene "${scene.scene}".`)
    }
    if (anchors.has(scene.anchor)) {
      throw new Error(
        `Demo ${demoName} has duplicate scene anchor ${scene.anchor}.`,
      )
    }
    sceneNames.add(scene.scene)
    anchors.add(scene.anchor)
  }
}

function defaultRecordingStartAnchor(
  storyboard: DemoStoryboard,
): GeneratedDemoScene["anchor"] {
  return storyboard.recording.start
    ? normalizeAnchor(storyboard.recording.start)
    : "before-step-1"
}

export function generateDemoAdapterSources(options: {
  demoName: string
  feature: ParsedFeature
  scenarioIndex: number
  generatedFilePath: string
  stepDefFiles: string[]
  storyboard: DemoStoryboard
}): DemoAdapterSources {
  const scenario = options.feature.scenarios[options.scenarioIndex]
  const scenes = buildDemoScenes(scenario, options.storyboard)
  validateDemoScenes(options.demoName, scenario, options.storyboard, scenes)

  const bddDir = join("tools", "testing", "bdd")
  const worldImport = relativeImport(
    options.generatedFilePath,
    join(bddDir, "world"),
  )
  const resolverImport = relativeImport(
    options.generatedFilePath,
    join(bddDir, "resolver"),
  )
  const parserImport = relativeImport(
    options.generatedFilePath,
    join(bddDir, "parser"),
  )
  const sharedStepsImport = relativeImport(
    options.generatedFilePath,
    join(bddDir, "shared-steps"),
  )

  const header = GENERATED_DEMO_HEADER.replace(
    "{{SOURCE_FEATURE}}",
    toPosix(options.feature.sourcePath),
  ).replace(
    "{{SOURCE_STORYBOARD}}",
    options.storyboard.sourcePath
      ? toPosix(options.storyboard.sourcePath)
      : "none (generated defaults)",
  )

  const stepImports = options.stepDefFiles
    .map(file => {
      const imp = relativeImport(
        options.generatedFilePath,
        file.replace(/\.ts$/, ""),
      )
      return `import ${JSON.stringify(imp)}`
    })
    .join("\n")

  const scriptScenes = Object.fromEntries(
    scenes.map(scene => [
      scene.anchor,
      { scene: scene.scene, durationMs: scene.durationMs },
    ]),
  )
  const manifest = scenes.map(scene => ({
    scene: scene.scene,
    text: scene.text,
    overlay: scene.overlay,
  }))

  const scriptSource = `${header}
import type { Page } from "@playwright/test"
import { cursorHighlight, showOverlay, test, type NarrationTimeline } from "@argo-video/cli"
import { parseFeatureFile } from ${JSON.stringify(parserImport)}
import { executeScenarioWithCallbacks } from ${JSON.stringify(resolverImport)}
import { BddWorld } from ${JSON.stringify(worldImport)}

import ${JSON.stringify(sharedStepsImport)}
${stepImports ? `${stepImports}\n` : ""}
const feature = parseFeatureFile(${JSON.stringify(toPosix(options.feature.sourcePath))})
const scenesByAnchor: Record<string, { scene: string; durationMs: number }> = ${JSON.stringify(scriptScenes, null, 2)}
const recordingStartAnchor = ${JSON.stringify(defaultRecordingStartAnchor(options.storyboard))}

async function maybeShowScene(
  page: Page,
  narration: NarrationTimeline,
  anchor: string,
  recordingStarted: { value: boolean },
): Promise<void> {
  if (!recordingStarted.value && anchor === recordingStartAnchor) {
    await narration.startRecording(page)
    recordingStarted.value = true
  }

  if (recordingStarted.value) {
    await cursorHighlight(page, {
      color: "#2563eb",
      radius: 18,
      opacity: 0.55,
      clickRipple: true,
    })
  }

  const scene = scenesByAnchor[anchor]
  if (!scene) return

  narration.mark(scene.scene)
  await showOverlay(page, scene.scene, scene.durationMs)
}

test(${JSON.stringify(options.demoName)}, async ({ page, narration }) => {
  const world = new BddWorld()
  world.resetState()
  world.attachToPage(page)
  const recordingStarted = { value: false }

  try {
    await executeScenarioWithCallbacks(
      world,
      feature.scenarios[${options.scenarioIndex}],
      {
        beforeStep: async ({ stepIndex }) => {
          await maybeShowScene(
            page,
            narration,
            \`before-step-\${stepIndex + 1}\`,
            recordingStarted,
          )
        },
        afterStep: async ({ stepIndex, error }) => {
          if (error) return
          await maybeShowScene(
            page,
            narration,
            \`after-step-\${stepIndex + 1}\`,
            recordingStarted,
          )
        },
      },
    )
  } finally {
    await world.teardown()
  }
})
`

  return {
    scriptSource,
    scenesJson: `${JSON.stringify(manifest, null, 2)}\n`,
    scenes,
  }
}

function validateDemoStoryboardCoverage(
  demoScenarios: ReadonlyArray<DemoScenarioInput>,
  tagFilter: string | undefined,
): void {
  if (tagFilter) return

  const unmatchedStoryboards = findUnmatchedDemoStoryboards(
    globSync(DEMO_STORYBOARD_GLOB).sort(),
    demoScenarios.map(scenario => scenario.storyboardPath),
  )

  if (unmatchedStoryboards.length === 0) return

  throw new Error(
    [
      "Found demo storyboard YAML without a matching @demo(...) scenario:",
      ...unmatchedStoryboards.map(path => `- ${path}`),
      "Add a matching @demo(<name>) tag or remove the stale storyboard.",
    ].join("\n"),
  )
}

// ── Cleanup ──────────────────────────────────────────────────────────

function cleanGeneratedWrappers(): number {
  const generatedFiles = globSync(`${GENERATED_WRAPPER_ROOT}/**/*.e2e.ts`)
  if (existsSync(GENERATED_WRAPPER_ROOT)) {
    rmSync(GENERATED_WRAPPER_ROOT, { recursive: true, force: true })
  }
  return generatedFiles.length
}

function cleanGeneratedDemoArtifacts(): number {
  const demoFiles = globSync(`${DEMO_DUMPS_DIR}/*.demo.ts`)
  let removed = 0

  for (const demoFile of demoFiles) {
    const source = readFileSync(demoFile, "utf8")
    if (
      !source.includes("AUTO-GENERATED") ||
      !source.includes("generate-bdd-playwright-tests.ts")
    ) {
      continue
    }

    rmSync(demoFile)
    removed++

    const manifestPath = demoFile.replace(/\.demo\.ts$/, ".scenes.json")
    if (existsSync(manifestPath)) {
      rmSync(manifestPath)
      removed++
    }
  }

  return removed
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
    const generatedFiles = [
      ...globSync(`${GENERATED_WRAPPER_ROOT}/**/*.e2e.ts`),
      ...globSync(`${DEMO_DUMPS_DIR}/*.demo.ts`),
      ...globSync(`${DEMO_DUMPS_DIR}/*.scenes.json`),
    ]
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
    const demoArtifacts = cleanGeneratedDemoArtifacts()
    console.log(
      `Cleaned all generated wrappers and BDD demo adapters (${wrappers + legacy + demoArtifacts} files).`,
    )
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
  const demoScenarios = collectDemoScenarios(features)
  validateDemoStoryboardCoverage(demoScenarios, tagFilter)

  for (const demoScenario of demoScenarios) {
    const storyboard = loadDemoStoryboard(
      demoScenario.storyboardPath,
      demoScenario.demoName,
    )
    const scenes = buildDemoScenes(demoScenario.scenario, storyboard)
    validateDemoScenes(
      demoScenario.demoName,
      demoScenario.scenario,
      storyboard,
      scenes,
    )
  }

  const expectedFiles = buildGeneratedFiles(features, demoScenarios)

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
  const demoArtifactsCleaned = cleanGeneratedDemoArtifacts()
  const generated = writeGeneratedFiles(expectedFiles)

  for (const file of expectedFiles) {
    console.log(`  ✓ ${toPosix(file.path)}`)
  }

  console.log("")
  const totalCleaned = wrappersCleaned + legacyCleaned + demoArtifactsCleaned
  const parts = [
    `Generated ${generated} file(s) (${expectedFiles.length - demoScenarios.length * 2} wrapper(s), ${demoScenarios.length} demo adapter(s))`,
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
