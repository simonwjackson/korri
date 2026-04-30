import {
  type GamepadHintEntry,
  GamepadHintGroup,
} from "../molecules/GamepadHintGroup"

export interface FooterActionsProps {
  onOptionsClick?: () => void
  onBackClick?: () => void
  onPlayClick?: () => void
}

export function FooterActions({
  onOptionsClick,
  onBackClick,
  onPlayClick,
}: FooterActionsProps) {
  const left: ReadonlyArray<GamepadHintEntry> = [
    { glyph: "Y", label: "Options", onClick: onOptionsClick },
  ]
  const right: ReadonlyArray<GamepadHintEntry> = [
    { glyph: "B", label: "Back", onClick: onBackClick },
    { glyph: "A", label: "Play", onClick: onPlayClick },
  ]
  return (
    <footer className="flex w-full items-center justify-between border-t border-neutral-300 px-3 py-2.5 text-xs text-neutral-600 dark:border-white/10 dark:text-white/70">
      <GamepadHintGroup hints={left} />
      <GamepadHintGroup hints={right} />
    </footer>
  )
}
