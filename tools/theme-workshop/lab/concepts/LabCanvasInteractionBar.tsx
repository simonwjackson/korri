import { Slash, Sparkles } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LabConceptCount } from "./LabConceptCount"
import { LabConceptMic } from "./LabConceptMic"
import { LAB_CONCEPT_DICTATION } from "./lab-concept-model"

const DEFAULT_COUNT = 3

/** Canvas-attached ask bar for the selected object. It is intentionally not a
 * panel: the selected canvas object is the thing being addressed. Generation
 * calls the dev-lab AI workflow (tools/lab-ai) and falls back to canned Takes
 * when that endpoint is unavailable. */
export function LabCanvasInteractionBar({
  targetName,
  onGenerate,
}: {
  readonly targetName: string
  readonly onGenerate: (request: {
    readonly prompt: string
    readonly count: number
  }) => void
}) {
  const [prompt, setPrompt] = useState("Make this feel less cramped")
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const transcriptRef = useRef("")
  transcriptRef.current = transcript

  useEffect(() => {
    if (!listening) return
    const words = LAB_CONCEPT_DICTATION.split(" ")
    let spoken = 0
    setTranscript("")
    const id = window.setInterval(() => {
      spoken += 1
      setTranscript(words.slice(0, spoken).join(" "))
      if (spoken >= words.length) window.clearInterval(id)
    }, 300)
    return () => window.clearInterval(id)
  }, [listening])

  const stopListening = () => {
    setPrompt(transcriptRef.current || LAB_CONCEPT_DICTATION)
    setTranscript("")
  }

  return (
    <div
      className="lab-canvas-ask"
      role="toolbar"
      aria-label={`Design with ${targetName}`}
    >
      <div className="lab-cspot-dock">
        <input
          className={`lab-cspot-textline${listening ? " is-voice" : ""}`}
          value={listening ? transcript : prompt}
          readOnly={listening}
          placeholder="Describe a direction…"
          aria-label={`Design intent for ${targetName}`}
          onChange={event => setPrompt(event.target.value)}
        />
        <div className="lab-cspot-controls">
          <button
            type="button"
            className="lab-cspot-slash"
            aria-label="Commands"
          >
            <Slash size={15} aria-hidden />
          </button>
          <LabConceptCount count={count} onCount={setCount} />
          <div className="lab-cspot-voice">
            <LabConceptMic
              listening={listening}
              onToggle={() =>
                setListening(prev => {
                  if (prev) stopListening()
                  return !prev
                })
              }
            />
            <button
              type="button"
              className="lab-cspot-go"
              aria-label={`Generate ${count} takes for ${targetName}`}
              onClick={() => {
                const finalPrompt = listening
                  ? transcriptRef.current || LAB_CONCEPT_DICTATION
                  : prompt
                if (listening) stopListening()
                setPrompt(finalPrompt)
                setListening(false)
                onGenerate({ prompt: finalPrompt, count })
              }}
            >
              <Sparkles size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
