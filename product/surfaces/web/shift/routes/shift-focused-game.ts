/**
 * Resolve which game is under focus from the DOM.
 *
 * Every game tile across the surface (home rail, library grid, …) carries a
 * `data-shift-game-id`. The app-level actions controller reads the focused
 * element and walks up to the nearest game holder, so pressing Options opens
 * the command sheet for whatever game is focused, on any screen — without each
 * surface wiring the trigger itself. Kept pure so the lookup is unit-testable.
 */
export const SHIFT_GAME_ID_ATTR = "data-shift-game-id"

export function shiftFocusedGameId(
  active: Element | null | undefined,
): string | null {
  const holder = active?.closest?.(`[${SHIFT_GAME_ID_ATTR}]`)
  const id = holder?.getAttribute(SHIFT_GAME_ID_ATTR) ?? ""
  return id.length > 0 ? id : null
}
