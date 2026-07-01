import type { LabConceptVariant } from "./lab-concept-model"

/** The Spotlight interaction. The stage Root owns the state; the concept renders
 * these controls colocated with the part. Generating drops the takes onto the
 * canvas — there is no accept/deny step afterward. */
export interface LabConceptSession {
  readonly variants: readonly LabConceptVariant[]
  readonly count: number
  readonly prompt: string
  readonly listening: boolean
  /** Live (interim) dictation shown in italics while the mic is capturing. */
  readonly transcript: string
  /** Whether the takes have been generated onto the canvas. */
  readonly generated: boolean
  readonly onPrompt: (prompt: string) => void
  readonly onMicToggle: () => void
  readonly onCount: (count: number) => void
  readonly onGenerate: () => void
}
