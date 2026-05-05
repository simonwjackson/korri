import type { InputdActionCommand } from "./inputd-actions"

export interface SwayOutputSnapshot {
  readonly name: string
  readonly active?: boolean
  readonly rect?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

export interface BottomKeyboardCommandOptions {
  readonly configuredCommand?: string
  readonly configuredOutput?: string
  readonly outputs?: readonly SwayOutputSnapshot[]
}

export interface BottomKeyboardCommandResult {
  readonly command?: InputdActionCommand
  readonly warning?: string
}

export function selectBottomOutput(
  outputs: readonly SwayOutputSnapshot[],
): SwayOutputSnapshot | undefined {
  return [...outputs]
    .filter(output => output.active !== false && output.rect)
    .sort((a, b) => (b.rect?.y ?? 0) - (a.rect?.y ?? 0))[0]
}

export function buildBottomKeyboardCommand(
  options: BottomKeyboardCommandOptions = {},
): BottomKeyboardCommandResult {
  const raw = options.configuredCommand?.trim()
  if (!raw) {
    return {
      warning:
        "no bottom keyboard command configured; set KORRI_INPUTD_BOTTOM_KEYBOARD to enable System+X",
    }
  }

  const output =
    options.configuredOutput?.trim() ||
    selectBottomOutput(options.outputs ?? [])?.name ||
    ""
  const expanded = raw.replaceAll("{output}", shellQuote(output))
  const [command, ...args] = expanded.split(/\s+/).filter(Boolean)
  if (!command) {
    return { warning: "bottom keyboard command resolved to an empty command" }
  }

  return { command: { command, args } }
}

function shellQuote(value: string): string {
  if (!value) return ""
  return `'${value.replaceAll("'", "'\\''")}'`
}
