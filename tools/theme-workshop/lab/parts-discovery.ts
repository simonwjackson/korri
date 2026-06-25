import { createElement, type ReactNode } from "react"
import type { Story, StoryLayer, WorkshopClassNames } from "../types"

export type PartModule = Record<string, unknown> & {
  readonly default?: unknown
  readonly name?: string
  readonly note?: string
  readonly surface?: boolean
  readonly rootProps?: Record<string, unknown>
  readonly classNames?: WorkshopClassNames
}

export interface LabPartsCatalog {
  readonly stories: readonly Story[]
  readonly classNames?: WorkshopClassNames
  readonly rootProps?: Record<string, unknown>
}

export interface PartPathInfo {
  readonly surfaceId: string
  readonly layer: StoryLayer
  readonly baseName: string
}

type PartLoader = () => Promise<PartModule>

type GlobFn = (
  pattern: string,
  options?: { eager?: false },
) => Record<string, PartLoader>

const LAYER_ORDER: Record<StoryLayer, number> = {
  page: 0,
  template: 1,
  organism: 2,
  molecule: 3,
  atom: 4,
}

const PART_PATH =
  /(?:^|\/)product\/surfaces\/web\/([^/]+)\/(.+)\.(atom|molecule|organism|template|page)\.part\.tsx$/

let injectedModules: Record<string, PartLoader> | null = null

export function parsePartPath(path: string): PartPathInfo | null {
  const match = path.match(PART_PATH)
  if (!match) return null
  return {
    surfaceId: match[1],
    baseName: match[2].split("/").at(-1) ?? match[2],
    layer: match[3] as StoryLayer,
  }
}

export function collectPartsFromModules(
  modules: Record<string, PartModule>,
  surfaceId: string,
): LabPartsCatalog {
  const stories: Story[] = []
  let classNames: WorkshopClassNames | undefined
  let rootProps: Record<string, unknown> | undefined

  for (const [path, mod] of Object.entries(modules)) {
    const parsed = parsePartPath(path)
    if (!parsed || parsed.surfaceId !== surfaceId) continue
    classNames ??= mod.classNames
    rootProps ??= mod.rootProps
    stories.push(...storiesFromModule(path, parsed, mod))
  }

  return {
    stories: stories.sort(
      (a, b) =>
        LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
        a.name.localeCompare(b.name),
    ),
    classNames,
    rootProps,
  }
}

export function hasSurfaceParts(surfaceId: string): boolean {
  return Object.keys(partModules()).some(path => {
    const parsed = parsePartPath(path)
    return parsed?.surfaceId === surfaceId
  })
}

export async function loadSurfaceParts(
  surfaceId: string,
): Promise<LabPartsCatalog> {
  const loaded: Record<string, PartModule> = {}
  for (const [path, load] of Object.entries(partModules())) {
    const parsed = parsePartPath(path)
    if (parsed?.surfaceId !== surfaceId) continue
    loaded[path] = await load()
  }
  return collectPartsFromModules(loaded, surfaceId)
}

export function __setPartModulesForTest(
  modules: Record<string, PartModule> | null,
): void {
  injectedModules = modules
    ? Object.fromEntries(
        Object.entries(modules).map(([path, mod]) => [path, async () => mod]),
      )
    : null
}

function partModules(): Record<string, PartLoader> {
  if (injectedModules) return injectedModules
  const glob = (import.meta as unknown as { glob?: GlobFn }).glob
  if (typeof glob !== "function") return {}
  return glob("./../../../product/surfaces/web/**/*.part.tsx")
}

function storiesFromModule(
  path: string,
  parsed: PartPathInfo,
  mod: PartModule,
): Story[] {
  const out: Story[] = []
  const push = (exportName: string, value: unknown) => {
    const story = storyFromExport(path, parsed, exportName, value, mod)
    if (story) out.push(story)
  }

  if (mod.default !== undefined) push("default", mod.default)
  for (const [exportName, value] of Object.entries(mod)) {
    if (RESERVED_EXPORTS.has(exportName)) continue
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) push(`${exportName}${index}`, item)
      continue
    }
    if (!isPascalCase(exportName)) continue
    push(exportName, value)
  }
  return out
}

const RESERVED_EXPORTS = new Set([
  "default",
  "name",
  "note",
  "surface",
  "rootProps",
  "classNames",
])

function storyFromExport(
  path: string,
  parsed: PartPathInfo,
  exportName: string,
  value: unknown,
  mod: PartModule,
): Story | null {
  if (isStory(value)) return value
  if (isStorySpec(value)) {
    const name = value.name ?? humanize(parsed.baseName)
    return {
      id: storyId(parsed, exportName, name),
      layer: parsed.layer,
      name,
      note: value.note,
      surface: value.presentation === "surface" ? true : undefined,
      render: value.render,
    }
  }
  if (typeof value !== "function") return null
  const name =
    exportName === "default" ? mod.name ?? humanize(parsed.baseName) : humanize(exportName)
  return {
    id: storyId(parsed, exportName, name),
    layer: parsed.layer,
    name,
    note: exportName === "default" ? mod.note : undefined,
    surface: mod.surface,
    render: () => {
      const Component = value as () => ReactNode
      return createElement(Component)
    },
  }
}

function isStory(value: unknown): value is Story {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { layer?: unknown }).layer === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { render?: unknown }).render === "function"
  )
}

function isStorySpec(value: unknown): value is {
  readonly name?: string
  readonly note?: string
  readonly presentation?: "part" | "surface"
  readonly render: () => ReactNode
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "render" in value &&
    typeof (value as { render?: unknown }).render === "function"
  )
}

function storyId(parsed: PartPathInfo, exportName: string, name: string): string {
  const suffix = exportName === "default" ? "" : `-${exportName}`
  return `${parsed.surfaceId}-${parsed.layer}-${parsed.baseName}${suffix}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function humanize(value: string): string {
  return value
    .replace(/Part$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isPascalCase(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(value)
}
