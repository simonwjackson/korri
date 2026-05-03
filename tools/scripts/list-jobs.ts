#!/usr/bin/env bun
/**
 * List all Jobs to be Done (JTBDs) declared under docs/jobs/.
 *
 * Reads frontmatter from each `docs/jobs/*.md` file and prints
 * a concise table of id, status, and title.
 *
 * Flags:
 *   --json   Emit JSON instead of a human-readable table.
 */

import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import fg from "fast-glob"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const JOB_GLOB = "docs/jobs/*.md"

interface JobRecord {
  id: string
  title: string
  status: string
  path: string
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

function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---\n")) return {}
  const end = content.indexOf("\n---\n", 4)
  if (end === -1) return {}

  const block = content.slice(4, end)
  const result: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/)
    if (!match) continue
    result[match[1]] = stripQuotes(match[2])
  }
  return result
}

function extractH1(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

function readJob(path: string): JobRecord {
  const content = readFileSync(path, "utf-8")
  const fm = parseFrontmatter(content)
  const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? path
  return {
    id: fm.id ?? slug,
    title: fm.title ?? extractH1(content) ?? slug,
    status: fm.status ?? "unknown",
    path: relative(ROOT, path),
  }
}

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length)
}

function printTable(jobs: JobRecord[]): void {
  if (jobs.length === 0) {
    console.log("No jobs found under docs/jobs/.")
    return
  }

  const idWidth = Math.max(2, ...jobs.map(j => j.id.length))
  const statusWidth = Math.max(6, ...jobs.map(j => j.status.length))

  console.log(`${pad("ID", idWidth)}  ${pad("STATUS", statusWidth)}  TITLE`)
  console.log(
    `${"-".repeat(idWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(5)}`,
  )
  for (const job of jobs) {
    console.log(
      `${pad(job.id, idWidth)}  ${pad(job.status, statusWidth)}  ${job.title}`,
    )
  }
  console.log(`\n${jobs.length} job${jobs.length === 1 ? "" : "s"}.`)
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json")
  const paths = await fg(JOB_GLOB, { cwd: ROOT, absolute: true })
  const jobs = paths.map(readJob).sort((a, b) => a.id.localeCompare(b.id))

  if (asJson) {
    console.log(JSON.stringify(jobs, null, 2))
    return
  }

  printTable(jobs)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
