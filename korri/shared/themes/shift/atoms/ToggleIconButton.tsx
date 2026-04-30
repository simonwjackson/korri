import type { LucideIcon } from "lucide-react"
import type { MouseEventHandler } from "react"

export interface ToggleIconButtonProps {
  on: boolean
  iconOn: LucideIcon
  iconOff: LucideIcon
  onClick: MouseEventHandler<HTMLButtonElement>
  ariaLabel: string
}

export function ToggleIconButton({
  on,
  iconOn: IconOn,
  iconOff: IconOff,
  onClick,
  ariaLabel,
}: ToggleIconButtonProps) {
  const Icon = on ? IconOn : IconOff
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={on}
      className="cursor-pointer border-none bg-transparent p-0 text-inherit"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  )
}
