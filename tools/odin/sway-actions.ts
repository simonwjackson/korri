export type SwayShortcutAction =
  | "workspace-prev"
  | "workspace-next"
  | "move-output-up"
  | "move-output-down"

export interface SwayActionCommand {
  readonly command: string
  readonly args: readonly string[]
}

const SWAY_COMMANDS: Record<SwayShortcutAction, string> = {
  "workspace-prev": "workspace prev_on_output",
  "workspace-next": "workspace next_on_output",
  "move-output-up": "move container to output up",
  "move-output-down": "move container to output down",
}

export function buildSwayShortcutCommand(
  action: SwayShortcutAction,
): SwayActionCommand {
  return { command: "swaymsg", args: [SWAY_COMMANDS[action]] }
}
