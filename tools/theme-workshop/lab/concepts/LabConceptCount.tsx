import { Minus, Plus } from "lucide-react"
import {
  LAB_CONCEPT_MAX_COUNT,
  LAB_CONCEPT_MIN_COUNT,
} from "./lab-concept-model"

/** Collapsed take-count control: a compact stepper instead of a row of chips. */
export function LabConceptCount({
  count,
  onCount,
}: {
  readonly count: number
  readonly onCount: (count: number) => void
}) {
  return (
    <div className="lab-ccount" role="toolbar" aria-label="Number of takes">
      <button
        type="button"
        className="lab-ccount-btn"
        aria-label="Fewer takes"
        disabled={count <= LAB_CONCEPT_MIN_COUNT}
        onClick={() => onCount(Math.max(LAB_CONCEPT_MIN_COUNT, count - 1))}
      >
        <Minus size={13} aria-hidden />
      </button>
      <span className="lab-ccount-value">{count}x</span>
      <button
        type="button"
        className="lab-ccount-btn"
        aria-label="More takes"
        disabled={count >= LAB_CONCEPT_MAX_COUNT}
        onClick={() => onCount(Math.min(LAB_CONCEPT_MAX_COUNT, count + 1))}
      >
        <Plus size={13} aria-hidden />
      </button>
    </div>
  )
}
