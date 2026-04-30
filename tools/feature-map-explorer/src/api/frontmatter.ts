import type { NodeKind } from "../types"

/*
 * Helpers for the editor's structured frontmatter form. Owns the small
 * amount of knowledge the form needs about which keys are "known" per
 * node kind so it can render typed inputs instead of raw YAML.
 *
 * Anything not in the known list lands in the "Other frontmatter" YAML
 * section the form renders alongside the structured fields.
 */

export const STATUS_VALUES = [
  "draft",
  "planned",
  "active",
  "implemented",
  "deprecated",
] as const

export type StatusValue = (typeof STATUS_VALUES)[number]

export type KnownFrontmatterShape = {
  id: string
  title: string
  status: StatusValue | ""
  jobs: string[]
}

export const KNOWN_KEYS = {
  job: ["id", "title", "status"] as const,
  brief: ["id", "title", "status", "jobs"] as const,
  feature: [] as const,
  bdd: [] as const,
}

export type KnownKey = (typeof KNOWN_KEYS)[NodeKind][number]

export function readKnown(
  frontmatter: Record<string, unknown>,
): KnownFrontmatterShape {
  return {
    id: stringField(frontmatter.id),
    title: stringField(frontmatter.title),
    status: statusField(frontmatter.status),
    jobs: stringArrayField(frontmatter.jobs),
  }
}

export function writeKnown(
  original: Record<string, unknown>,
  known: KnownFrontmatterShape,
  kind: NodeKind,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...original }
  const keys = KNOWN_KEYS[kind]
  for (const key of keys) {
    if (key === "jobs") {
      next.jobs = known.jobs
    } else if (key === "status") {
      if (known.status === "") delete next.status
      else next.status = known.status
    } else {
      const value = known[key]
      if (value === "") delete next[key]
      else next[key] = value
    }
  }
  return next
}

export function partitionExtras(
  frontmatter: Record<string, unknown>,
  kind: NodeKind,
): Record<string, unknown> {
  const keys = new Set<string>(KNOWN_KEYS[kind])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!keys.has(key)) out[key] = value
  }
  return out
}

function stringField(value: unknown): string {
  if (typeof value === "string") return value
  return ""
}

function statusField(value: unknown): StatusValue | "" {
  if (typeof value !== "string") return ""
  return (STATUS_VALUES as readonly string[]).includes(value)
    ? (value as StatusValue)
    : ""
}

function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string")
}
