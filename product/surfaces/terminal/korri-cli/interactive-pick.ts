import type { GameRecord } from "@platform/fixtures/games/game"
import type { GamePicker } from "./game-picker"

/**
 * Outcome of an interactive game selection, so call sites map each case to
 * their own message and exit behavior instead of re-deriving the TTY /
 * picker / cancel checks by hand.
 */
export type InteractivePickResult =
  | { readonly _tag: "Picked"; readonly choice: GameRecord }
  | { readonly _tag: "NoTty" }
  | { readonly _tag: "NoPicker" }
  | { readonly _tag: "Cancelled" }

export interface InteractivePickOptions {
  readonly choices: readonly GameRecord[]
  readonly stdinIsTty?: boolean
  readonly gamePicker?: GamePicker
}

/**
 * Run the shared "is this a terminal? is a picker available? pick, or cancel"
 * sequence. A picker that throws propagates to the caller unchanged.
 */
export async function pickGameChoice(
  options: InteractivePickOptions,
): Promise<InteractivePickResult> {
  if (options.stdinIsTty === false) return { _tag: "NoTty" }
  if (!options.gamePicker) return { _tag: "NoPicker" }
  const selected = await options.gamePicker(options.choices)
  if (!selected) return { _tag: "Cancelled" }
  return { _tag: "Picked", choice: selected }
}
