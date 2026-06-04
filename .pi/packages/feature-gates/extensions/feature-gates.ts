import { relative, resolve, sep } from "node:path"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

const SKILL_NAME = "feature-gates"
const PACKAGE_ROOT = ".pi/packages/feature-gates"
const SKILL_PATH = `${PACKAGE_ROOT}/skills/${SKILL_NAME}/SKILL.md`
const GATES_DIR = `product${sep}platform${sep}gates`

type ReadInput = {
  path?: string
}

type WriteInput = {
  path?: string
}

type EditOperation = {
  oldText?: string
  newText?: string
}

type EditInput = {
  path?: string
  edits?: EditOperation[]
}

function stripAtPrefix(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path
}

function normalizePath(cwd: string, maybePath: string): string {
  return resolve(cwd, stripAtPrefix(maybePath))
}

function isGatesPath(cwd: string, maybePath: string | undefined): boolean {
  if (!maybePath) return false

  const absolutePath = normalizePath(cwd, maybePath)
  const rel = relative(cwd, absolutePath)

  return rel === GATES_DIR || rel.startsWith(`${GATES_DIR}${sep}`)
}

function isSkillPath(cwd: string, maybePath: string | undefined): boolean {
  if (!maybePath) return false

  return normalizePath(cwd, maybePath) === resolve(cwd, SKILL_PATH)
}

function buildBlockReason(): string {
  return [
    `Auto-loading /skill:${SKILL_NAME} because this change targets product/platform/gates.`,
    "Once the skill is in session context, retry the edit with the feature gate conventions applied.",
  ].join(" ")
}

export default function featureGatesExtension(pi: ExtensionAPI) {
  let skillLoadedForSession = false
  let skillLoadQueued = false

  pi.on("session_start", async () => {
    skillLoadedForSession = false
    skillLoadQueued = false
  })

  pi.on("input", async event => {
    if (event.text.trim().startsWith(`/skill:${SKILL_NAME}`)) {
      skillLoadedForSession = true
      skillLoadQueued = false
    }

    return { action: "continue" as const }
  })

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "read") {
      const input = event.input as ReadInput
      if (isSkillPath(ctx.cwd, input.path)) {
        skillLoadedForSession = true
      }
      return
    }

    if (skillLoadedForSession) {
      return
    }

    const queueSkillLoad = () => {
      if (skillLoadQueued || skillLoadedForSession) {
        return
      }

      skillLoadQueued = true
      pi.sendUserMessage(`/skill:${SKILL_NAME}`, { deliverAs: "steer" })

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Auto-loading /skill:${SKILL_NAME} for gate infrastructure work`,
          "info",
        )
      }
    }

    if (event.toolName === "write") {
      const input = event.input as WriteInput
      if (isGatesPath(ctx.cwd, input.path)) {
        queueSkillLoad()
        return { block: true, reason: buildBlockReason() }
      }
      return
    }

    if (event.toolName === "edit") {
      const input = event.input as EditInput
      if (isGatesPath(ctx.cwd, input.path) && (input.edits?.length ?? 0) > 0) {
        queueSkillLoad()
        return { block: true, reason: buildBlockReason() }
      }
    }
  })
}
