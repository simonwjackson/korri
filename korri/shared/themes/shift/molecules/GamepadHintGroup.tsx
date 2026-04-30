import { type GamepadGlyph, GamepadHint } from "../atoms/GamepadHint"

export interface GamepadHintEntry {
  glyph: GamepadGlyph
  label: string
  onClick?: () => void
}

export interface GamepadHintGroupProps {
  hints: ReadonlyArray<GamepadHintEntry>
  gap?: "tight" | "wide"
}

export function GamepadHintGroup({
  hints,
  gap = "wide",
}: GamepadHintGroupProps) {
  const gapClass = gap === "tight" ? "gap-2" : "gap-4"
  return (
    <div className={`flex items-center ${gapClass}`}>
      {hints.map(hint => (
        <GamepadHint
          key={`${hint.glyph}-${hint.label}`}
          glyph={hint.glyph}
          label={hint.label}
          onClick={hint.onClick}
        />
      ))}
    </div>
  )
}
