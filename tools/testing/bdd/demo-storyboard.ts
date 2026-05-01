import { existsSync, readFileSync } from "node:fs"
import { parseDocument } from "yaml"

/*
 * Conservative parser for `e2e/<demo-name>.demo.yaml` storyboards.
 *
 * Storyboards carry presentation metadata only — narration text, overlay
 * placement, scene durations, and recording hints. Behavior (routes,
 * selectors, clicks, fills, assertions, step lists) belongs in the
 * `.feature` file and step definitions and is rejected here.
 */

const forbiddenBehaviorFields = new Set([
  "action",
  "actions",
  "assert",
  "assertion",
  "click",
  "expect",
  "fill",
  "goto",
  "locator",
  "route",
  "selector",
  "steps",
])

const forbiddenNarrationPatterns = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /tenant/i,
  /customer/i,
]

const allowedRootFields = new Set(["demo", "recording", "scenes"])
const allowedRecordingFields = new Set(["start"])
const allowedSceneFields = new Set([
  "scene",
  "narration",
  "text",
  "durationMs",
  "overlay",
])

export type DemoSceneAnchor =
  | `step-${number}`
  | `before-step-${number}`
  | `after-step-${number}`

export type DemoStoryboardScene = {
  anchor: DemoSceneAnchor
  scene: string
  text: string
  durationMs: number | undefined
  overlay: Record<string, unknown> | undefined
}

export type DemoStoryboard = {
  demo: string
  sourcePath: string | undefined
  recording: {
    start: DemoSceneAnchor | undefined
  }
  scenes: DemoStoryboardScene[]
}

export function parseDemoStoryboardSource(
  source: string,
  sourcePath: string,
  expectedDemo: string,
): DemoStoryboard {
  const document = parseDocument(source, { prettyErrors: false })
  if (document.errors.length > 0) {
    throw new Error(
      `Failed to parse demo storyboard ${sourcePath}: ${document.errors[0].message}`,
    )
  }

  const raw = document.toJSON()
  if (!isRecord(raw)) {
    throw new Error(`Demo storyboard ${sourcePath} must contain a YAML object`)
  }

  validateAllowedKeys(raw, allowedRootFields, sourcePath, "storyboard")
  validateNoBehaviorFields(raw, sourcePath)

  const demo = requireString(raw.demo, sourcePath, "demo")
  if (demo !== expectedDemo) {
    throw new Error(
      `Demo storyboard ${sourcePath} declares demo "${demo}" but expected "${expectedDemo}"`,
    )
  }

  return {
    demo,
    sourcePath,
    recording: parseRecording(raw.recording, sourcePath),
    scenes: parseScenes(raw.scenes, sourcePath),
  }
}

export function loadDemoStoryboard(
  sourcePath: string,
  expectedDemo: string,
): DemoStoryboard {
  if (!existsSync(sourcePath)) {
    return createDefaultDemoStoryboard(expectedDemo)
  }

  return parseDemoStoryboardSource(
    readFileSync(sourcePath, "utf8"),
    sourcePath,
    expectedDemo,
  )
}

export function createDefaultDemoStoryboard(demo: string): DemoStoryboard {
  return {
    demo,
    sourcePath: undefined,
    recording: { start: undefined },
    scenes: [],
  }
}

export function isDemoSceneAnchor(value: string): value is DemoSceneAnchor {
  return /^(?:before-step-|after-step-|step-)\d+$/.test(value)
}

export function demoSceneAnchorStepNumber(anchor: DemoSceneAnchor): number {
  const match = anchor.match(/(\d+)$/)
  if (!match) throw new Error(`Invalid demo scene anchor: ${anchor}`)
  return Number.parseInt(match[1], 10)
}

export function demoSceneAnchorTiming(
  anchor: DemoSceneAnchor,
): "before" | "after" {
  if (anchor.startsWith("before-step-")) return "before"
  return "after"
}

function parseRecording(
  raw: unknown,
  sourcePath: string,
): DemoStoryboard["recording"] {
  if (raw === undefined || raw === null) return { start: undefined }
  if (!isRecord(raw)) {
    throw new Error(
      `Demo storyboard ${sourcePath} field recording must be an object`,
    )
  }

  validateAllowedKeys(raw, allowedRecordingFields, sourcePath, "recording")

  const start = raw.start
  if (start === undefined || start === null) return { start: undefined }
  if (typeof start !== "string" || !isDemoSceneAnchor(start)) {
    throw new Error(
      `Demo storyboard ${sourcePath} recording.start must be a step anchor such as before-step-2 or after-step-2`,
    )
  }

  return { start }
}

function parseScenes(raw: unknown, sourcePath: string): DemoStoryboardScene[] {
  if (raw === undefined || raw === null) return []
  if (!isRecord(raw)) {
    throw new Error(
      `Demo storyboard ${sourcePath} field scenes must be an object`,
    )
  }

  return Object.entries(raw).map(([anchor, value]) => {
    if (!isDemoSceneAnchor(anchor)) {
      throw new Error(
        `Demo storyboard ${sourcePath} scene key "${anchor}" must be a step anchor such as before-step-2 or after-step-2`,
      )
    }

    if (!isRecord(value)) {
      throw new Error(
        `Demo storyboard ${sourcePath} scene "${anchor}" must be an object`,
      )
    }

    validateAllowedKeys(
      value,
      allowedSceneFields,
      sourcePath,
      `scene ${anchor}`,
    )

    const scene = requireString(
      value.scene,
      sourcePath,
      `scenes.${anchor}.scene`,
    )
    const text = requireOptionalString(
      value.narration ?? value.text,
      sourcePath,
      `scenes.${anchor}.narration`,
    )
    const durationMs = parseOptionalPositiveInteger(
      value.durationMs,
      sourcePath,
      `scenes.${anchor}.durationMs`,
    )
    const overlay = parseOptionalRecord(
      value.overlay,
      sourcePath,
      `scenes.${anchor}.overlay`,
    )

    const narrationText = text ?? defaultNarrationText(scene)
    validateNarrationText(
      narrationText,
      sourcePath,
      `scenes.${anchor}.narration`,
    )

    return {
      anchor,
      scene,
      text: narrationText,
      durationMs,
      overlay,
    }
  })
}

function validateAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  sourcePath: string,
  location: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Demo storyboard ${sourcePath} has unsupported field ${location}.${key}`,
      )
    }
  }
}

function validateNoBehaviorFields(value: unknown, sourcePath: string): void {
  const stack: Array<{ value: unknown; path: string }> = [
    { value, path: "storyboard" },
  ]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => {
        stack.push({ value: item, path: `${current.path}[${index}]` })
      })
      continue
    }

    if (!isRecord(current.value)) continue

    for (const [key, nestedValue] of Object.entries(current.value)) {
      if (forbiddenBehaviorFields.has(key)) {
        throw new Error(
          `Demo storyboard ${sourcePath} must not define behavior field ${current.path}.${key}`,
        )
      }
      stack.push({ value: nestedValue, path: `${current.path}.${key}` })
    }
  }
}

function validateNarrationText(
  text: string,
  sourcePath: string,
  field: string,
): void {
  const matchedPattern = forbiddenNarrationPatterns.find(pattern =>
    pattern.test(text),
  )
  if (!matchedPattern) return

  throw new Error(
    `Demo storyboard ${sourcePath} field ${field} contains local-demo unsafe narration matching ${matchedPattern}.`,
  )
}

function defaultNarrationText(scene: string): string {
  return scene.split(/[-_]+/).filter(Boolean).join(" ")
}

function requireString(
  value: unknown,
  sourcePath: string,
  field: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Demo storyboard ${sourcePath} field ${field} must be a string`,
    )
  }
  return value
}

function requireOptionalString(
  value: unknown,
  sourcePath: string,
  field: string,
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Demo storyboard ${sourcePath} field ${field} must be a string`,
    )
  }
  return value
}

function parseOptionalPositiveInteger(
  value: unknown,
  sourcePath: string,
  field: string,
): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Demo storyboard ${sourcePath} field ${field} must be a positive integer`,
    )
  }
  return value
}

function parseOptionalRecord(
  value: unknown,
  sourcePath: string,
  field: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new Error(
      `Demo storyboard ${sourcePath} field ${field} must be an object`,
    )
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
