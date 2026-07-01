import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LabConceptSpotlight } from "./LabConceptSpotlight"
import {
  LAB_CONCEPT_DICTATION,
  LAB_CONCEPT_VARIANTS,
} from "./lab-concept-model"
import type { LabConceptSession } from "./lab-concept-session"

const DEFAULT_COUNT = 3

/** Root for the Spotlight prototype: owns the session state and renders the
 * concept as a full-shell overlay. Generating drops the takes onto the canvas;
 * there is no accept/deny afterward. */
export function LabConceptStage({ onClose }: { readonly onClose: () => void }) {
  const [prompt, setPrompt] = useState("Make this feel less cramped")
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [generated, setGenerated] = useState(false)

  // Keep the latest interim text for commit-on-stop without re-running capture.
  const transcriptRef = useRef("")
  transcriptRef.current = transcript

  // Stand-in for real speech capture: while listening, stream the canned
  // dictation a word at a time so the italic line fills like a live transcript.
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

  const variants = LAB_CONCEPT_VARIANTS.slice(0, count)
  const session: LabConceptSession = {
    variants,
    count,
    prompt,
    listening,
    transcript,
    generated,
    onPrompt: setPrompt,
    onMicToggle: () =>
      setListening(prev => {
        // Stopping commits whatever was heard into the prompt.
        if (prev) {
          setPrompt(transcriptRef.current || LAB_CONCEPT_DICTATION)
          setTranscript("")
        }
        return !prev
      }),
    onCount: next => {
      setCount(next)
      setGenerated(false)
    },
    onGenerate: () => {
      if (listening) setPrompt(transcriptRef.current || LAB_CONCEPT_DICTATION)
      setListening(false)
      setTranscript("")
      setGenerated(true)
    },
  }

  return (
    <div className="lab-cstage" role="dialog" aria-label="Design pass">
      <div className="lab-cstage-bar">
        <span className="lab-cstage-title">Design pass</span>
        <p className="lab-cstage-blurb">
          Ask, then drop the takes onto the canvas to work with.
        </p>
        <button
          type="button"
          className="lab-cstage-close"
          aria-label="Close design pass"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="lab-cstage-canvas">
        <LabConceptSpotlight session={session} />
      </div>
    </div>
  )
}
