#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import fg from "fast-glob"
import { parseFeatureFile } from "../../testing/bdd/parser"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../../..")
const OUTPUT = resolve(ROOT, "out/generated/feature-map/feature-map.json")

const JOB_GLOB = "docs/jobs/*.md"
const FEATURE_GLOB = "korri/products/*/features/*"
const BRIEF_GLOB = "korri/products/*/features/*/brief.md"
const BDD_GLOB = "korri/products/*/features/*/e2e/*.feature"

type Status = "draft" | "planned" | "active" | "implemented" | "deprecated"
type DiagnosticSeverity = "error" | "warning"
type ScenarioStatus = "active" | "fixme" | "skip"

interface Frontmatter {
  id?: string
  title?: string
  status?: Status
  jobs?: string[]
}

interface JobNode {
  id: string
  title: string
  status: Status
  path: string
}

interface FeatureNode {
  id: string
  product: string
  name: string
  path: string
  briefId: string | null
  bddIds: string[]
}

interface BriefNode {
  id: string
  title: string
  status: Status
  path: string
  featureId: string
  jobs: string[]
}

interface BddScenario {
  name: string
  tags: string[]
  status: ScenarioStatus
}

interface BddNode {
  id: string
  name: string
  path: string
  featureId: string
  briefId: string | null
  jobIds: string[]
  scenarios: BddScenario[]
}

interface GraphEdge {
  from: string
  to: string
  type: "informs" | "specifies" | "verifies" | "contains"
}

interface Diagnostic {
  severity: DiagnosticSeverity
  message: string
  path?: string
}

interface FeatureMap {
  generatedAt: string
  jobs: JobNode[]
  features: FeatureNode[]
  briefs: BriefNode[]
  bdd: BddNode[]
  edges: GraphEdge[]
  diagnostics: Diagnostic[]
}

function toPosix(path: string): string {
  return path.split("\\").join("/")
}

function repoPath(path: string): string {
  return toPosix(relative(ROOT, path))
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---\n")) return {}

  const end = content.indexOf("\n---\n", 4)
  if (end === -1) return {}

  const block = content.slice(4, end)
  const lines = block.split("\n")
  const result: Record<string, string | string[]> = {}

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (rawValue.trim() !== "") {
      result[key] = stripQuotes(rawValue)
      continue
    }

    const values: string[] = []
    let next = index + 1
    while (next < lines.length) {
      const item = lines[next].match(/^\s+-\s+(.+)$/)
      if (!item) break
      values.push(stripQuotes(item[1]))
      next++
    }
    result[key] = values
    index = next - 1
  }

  return {
    id: typeof result.id === "string" ? result.id : undefined,
    title: typeof result.title === "string" ? result.title : undefined,
    status:
      typeof result.status === "string" ? (result.status as Status) : undefined,
    jobs: Array.isArray(result.jobs) ? result.jobs : undefined,
  }
}

function extractH1(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function slugFromPath(path: string): string {
  return repoPath(path).split("/").pop()?.replace(/\.md$/, "") ?? repoPath(path)
}

function readMarkdownNode(
  path: string,
): Frontmatter & { fallbackTitle: string } {
  const content = readFileSync(path, "utf-8")
  const frontmatter = parseFrontmatter(content)
  return {
    ...frontmatter,
    fallbackTitle:
      frontmatter.title ?? extractH1(content) ?? slugFromPath(path),
  }
}

function featureIdFromPath(path: string): string {
  const parts = repoPath(path).split("/")
  const product = parts[2] ?? "unknown"
  const feature = parts[4] ?? "unknown"
  return `${product}/${feature}`
}

function briefIdFromFeatureComments(content: string): string | null {
  const match = content.match(/^#\s*Brief ID:\s*(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function jobIdsFromFeatureComments(content: string): string[] {
  const match = content.match(/^#\s*Job IDs:\s*(.+)$/m)
  if (!match) return []
  return match[1]
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
}

function scenarioStatus(tags: string[]): ScenarioStatus {
  const lower = tags.map(tag => tag.toLowerCase())
  if (lower.some(tag => tag === "@skip" || tag.startsWith("@skip("))) {
    return "skip"
  }
  if (lower.some(tag => tag === "@fixme" || tag.startsWith("@fixme("))) {
    return "fixme"
  }
  return "active"
}

function addDuplicateDiagnostics(
  diagnostics: Diagnostic[],
  kind: string,
  entries: Array<{ id: string; path: string }>,
) {
  const seen = new Map<string, string>()
  for (const entry of entries) {
    const existing = seen.get(entry.id)
    if (existing) {
      diagnostics.push({
        severity: "error",
        message: `Duplicate ${kind} id "${entry.id}" in ${existing} and ${entry.path}`,
        path: entry.path,
      })
    } else {
      seen.set(entry.id, entry.path)
    }
  }
}

function buildFeatureMap(generatedAt: string): FeatureMap {
  const diagnostics: Diagnostic[] = []

  const jobFiles = fg.sync(JOB_GLOB, { cwd: ROOT, absolute: true }).sort()
  const jobs: JobNode[] = jobFiles.map(file => {
    const node = readMarkdownNode(file)
    const path = repoPath(file)
    if (!node.id) {
      diagnostics.push({
        severity: "error",
        message: "Job is missing frontmatter id",
        path,
      })
    }
    return {
      id: node.id ?? slugFromPath(file),
      title: node.fallbackTitle,
      status: node.status ?? "draft",
      path,
    }
  })

  const featureDirs = fg
    .sync(FEATURE_GLOB, { cwd: ROOT, absolute: true, onlyDirectories: true })
    .sort()

  const briefFiles = fg.sync(BRIEF_GLOB, { cwd: ROOT, absolute: true }).sort()
  const briefs: BriefNode[] = briefFiles.map(file => {
    const node = readMarkdownNode(file)
    const path = repoPath(file)
    if (!node.id) {
      diagnostics.push({
        severity: "error",
        message: "Feature brief is missing frontmatter id",
        path,
      })
    }
    return {
      id: node.id ?? featureIdFromPath(file).replace("/", ":"),
      title: node.fallbackTitle,
      status: node.status ?? "planned",
      path,
      featureId: featureIdFromPath(file),
      jobs: node.jobs ?? [],
    }
  })

  const briefByFeature = new Map(briefs.map(brief => [brief.featureId, brief]))
  const briefById = new Map(briefs.map(brief => [brief.id, brief]))
  const jobById = new Map(jobs.map(job => [job.id, job]))

  const bddFiles = fg.sync(BDD_GLOB, { cwd: ROOT, absolute: true }).sort()
  const bdd: BddNode[] = bddFiles.map(file => {
    const path = repoPath(file)
    const content = readFileSync(file, "utf-8")
    const feature = parseFeatureFile(path)
    const featureId = featureIdFromPath(file)
    const colocatedBrief = briefByFeature.get(featureId)
    const briefId =
      briefIdFromFeatureComments(content) ?? colocatedBrief?.id ?? null
    const jobIds = jobIdsFromFeatureComments(content)

    return {
      id: path.replace(/\.feature$/, ""),
      name: feature.name,
      path,
      featureId,
      briefId,
      jobIds,
      scenarios: feature.scenarios.map(scenario => ({
        name: scenario.name,
        tags: scenario.tags,
        status: scenarioStatus(scenario.tags),
      })),
    }
  })

  const bddByFeature = new Map<string, string[]>()
  for (const node of bdd) {
    const existing = bddByFeature.get(node.featureId) ?? []
    existing.push(node.id)
    bddByFeature.set(node.featureId, existing)
  }

  const features: FeatureNode[] = featureDirs.map(dir => {
    const id = featureIdFromPath(dir)
    const parts = repoPath(dir).split("/")
    const product = parts[2] ?? "unknown"
    const name = parts[4] ?? "unknown"
    const brief = briefByFeature.get(id)
    return {
      id,
      product,
      name,
      path: repoPath(dir),
      briefId: brief?.id ?? null,
      bddIds: bddByFeature.get(id) ?? [],
    }
  })

  addDuplicateDiagnostics(diagnostics, "job", jobs)
  addDuplicateDiagnostics(diagnostics, "brief", briefs)

  for (const brief of briefs) {
    if (!features.some(feature => feature.id === brief.featureId)) {
      diagnostics.push({
        severity: "error",
        message: `Brief "${brief.id}" is not colocated in a known feature folder`,
        path: brief.path,
      })
    }

    if (brief.jobs.length === 0) {
      diagnostics.push({
        severity: "warning",
        message: `Brief "${brief.id}" does not reference any jobs`,
        path: brief.path,
      })
    }

    for (const jobId of brief.jobs) {
      if (!jobById.has(jobId)) {
        diagnostics.push({
          severity: "error",
          message: `Brief "${brief.id}" references missing job "${jobId}"`,
          path: brief.path,
        })
      }
    }
  }

  for (const feature of features) {
    if (!feature.briefId) {
      diagnostics.push({
        severity: "warning",
        message: `Feature "${feature.id}" has no colocated brief.md`,
        path: feature.path,
      })
    }
  }

  for (const node of bdd) {
    if (!node.briefId) {
      diagnostics.push({
        severity: "warning",
        message: `BDD feature "${node.path}" does not link to a brief`,
        path: node.path,
      })
    } else if (!briefById.has(node.briefId)) {
      diagnostics.push({
        severity: "error",
        message: `BDD feature "${node.path}" references missing brief "${node.briefId}"`,
        path: node.path,
      })
    }

    for (const jobId of node.jobIds) {
      if (!jobById.has(jobId)) {
        diagnostics.push({
          severity: "error",
          message: `BDD feature "${node.path}" references missing job "${jobId}"`,
          path: node.path,
        })
      }
    }
  }

  const edges: GraphEdge[] = []

  for (const brief of briefs) {
    edges.push({
      from: `feature:${brief.featureId}`,
      to: `brief:${brief.id}`,
      type: "specifies",
    })

    for (const jobId of brief.jobs) {
      edges.push({
        from: `job:${jobId}`,
        to: `brief:${brief.id}`,
        type: "informs",
      })
    }
  }

  for (const node of bdd) {
    edges.push({
      from: `feature:${node.featureId}`,
      to: `bdd:${node.id}`,
      type: "contains",
    })

    if (node.briefId) {
      edges.push({
        from: `brief:${node.briefId}`,
        to: `bdd:${node.id}`,
        type: "verifies",
      })
    }

    for (const jobId of node.jobIds) {
      edges.push({
        from: `job:${jobId}`,
        to: `bdd:${node.id}`,
        type: "informs",
      })
    }
  }

  return {
    generatedAt,
    jobs,
    features,
    briefs,
    bdd,
    edges,
    diagnostics,
  }
}

function stableMapForCheck(map: FeatureMap): FeatureMap {
  return { ...map, generatedAt: "<generated>" }
}

function serialize(map: FeatureMap): string {
  return `${JSON.stringify(map, null, 2)}\n`
}

function parseCliArgs(): { check: boolean } {
  return { check: process.argv.includes("--check") }
}

function main() {
  const { check } = parseCliArgs()
  const generatedAt = check ? "<generated>" : new Date().toISOString()
  const map = buildFeatureMap(generatedAt)
  const expected = serialize(check ? stableMapForCheck(map) : map)

  if (check) {
    if (!existsSync(OUTPUT)) {
      throw new Error(
        `${repoPath(OUTPUT)} is missing. Run: just generate-feature-map`,
      )
    }

    const current = readFileSync(OUTPUT, "utf-8")
    let normalizedCurrent: string
    try {
      normalizedCurrent = serialize(
        stableMapForCheck(JSON.parse(current) as FeatureMap),
      )
    } catch (error) {
      throw new Error(
        `${repoPath(OUTPUT)} is not valid feature-map JSON: ${String(error)}`,
      )
    }

    if (normalizedCurrent !== expected) {
      throw new Error(
        `${repoPath(OUTPUT)} is stale. Run: just generate-feature-map`,
      )
    }
  } else {
    mkdirSync(dirname(OUTPUT), { recursive: true })
    writeFileSync(OUTPUT, expected, "utf-8")
  }

  for (const diagnostic of map.diagnostics) {
    const prefix = diagnostic.severity === "error" ? "ERROR" : "WARN"
    console.warn(
      `${prefix}: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`,
    )
  }

  const errors = map.diagnostics.filter(
    diagnostic => diagnostic.severity === "error",
  )
  if (errors.length > 0) {
    throw new Error(`Feature map has ${errors.length} error(s).`)
  }

  const action = check ? "Checked" : "Generated"
  console.log(
    `${action} ${repoPath(OUTPUT)}: ${map.jobs.length} job(s), ${map.features.length} feature(s), ${map.briefs.length} brief(s), ${map.bdd.length} BDD file(s).`,
  )
}

main()
