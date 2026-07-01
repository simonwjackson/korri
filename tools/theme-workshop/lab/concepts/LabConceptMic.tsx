import { Mic, Square } from "lucide-react"

/** Mic capture affordance. Prototype: toggling it stands in for speech input —
 * stopping drops a canned transcript into the prompt. */
export function LabConceptMic({
  listening,
  onToggle,
}: {
  readonly listening: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`lab-cmic${listening ? " is-live" : ""}`}
      aria-label={listening ? "Stop dictation" : "Dictate intent"}
      aria-pressed={listening}
      onClick={onToggle}
    >
      {listening ? (
        <Square size={13} aria-hidden />
      ) : (
        <Mic size={15} aria-hidden />
      )}
    </button>
  )
}
