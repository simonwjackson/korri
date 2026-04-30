import type { MouseEventHandler } from "react"

export type GamepadGlyph = "A" | "B" | "X" | "Y"

export interface GamepadHintProps {
  glyph: GamepadGlyph
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export function GamepadHint({ glyph, label, onClick }: GamepadHintProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-inherit"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-400 text-xs font-semibold dark:border-white/50">
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  )
}
