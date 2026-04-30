import type { LucideIcon } from "lucide-react"

export interface StatusIconProps {
  icon: LucideIcon
  ariaLabel: string
  className?: string
}

/**
 * Sized + labeled wrapper around a lucide icon. Centralizes sizing and
 * aria-labeling so themes can swap icon libraries by replacing this atom.
 */
export function StatusIcon({
  icon: Icon,
  ariaLabel,
  className,
}: StatusIconProps) {
  return <Icon aria-label={ariaLabel} className={className ?? "h-4 w-4"} />
}
