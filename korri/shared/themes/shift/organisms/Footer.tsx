import {
  type GamepadHintEntry,
  GamepadHintGroup,
} from "../molecules/GamepadHintGroup"

export interface FooterProps {
  onCategoriesClick?: () => void
  onDebugClick?: () => void
  onPlayClick?: () => void
}

export function Footer({
  onCategoriesClick,
  onDebugClick,
  onPlayClick,
}: FooterProps) {
  const leftHints: ReadonlyArray<GamepadHintEntry> = [
    { glyph: "Y", label: "Categories", onClick: onCategoriesClick },
  ]
  const rightHints: ReadonlyArray<GamepadHintEntry> = [
    { glyph: "Y", label: "Debug", onClick: onDebugClick },
    { glyph: "A", label: "Play", onClick: onPlayClick },
  ]

  return (
    <footer className="flex w-full items-center justify-between border-t border-border bg-neutral-200 px-3 py-2.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-white/70">
      <GamepadHintGroup hints={leftHints} />
      <GamepadHintGroup hints={rightHints} />
    </footer>
  )
}
