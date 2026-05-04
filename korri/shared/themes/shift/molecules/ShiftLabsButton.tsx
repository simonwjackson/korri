import { FlaskConical } from "lucide-react"
import { ShiftPill } from "../atoms/ShiftPill"

export interface ShiftLabsButtonProps {
  readonly onActivate: () => void
  readonly label?: string
}

export function ShiftLabsButton({
  onActivate,
  label = "Labs",
}: ShiftLabsButtonProps) {
  return (
    <ShiftPill
      onClick={onActivate}
      aria-label={label}
      className="shift-labs-button text-lg"
    >
      <FlaskConical className="shift-pill-icon" strokeWidth={2.25} />
    </ShiftPill>
  )
}
