/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Minimal in-game HUD overlay (static).
 */
import { HudOverlay } from "../../ui/organisms/HudOverlay"
import { GameOverlay } from "../../ui/templates/GameOverlay"

export function InGameHud() {
  return (
    <GameOverlay>
      <HudOverlay />
    </GameOverlay>
  )
}
