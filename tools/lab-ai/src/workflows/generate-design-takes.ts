import { defineAgent, defineWorkflow } from "@flue/runtime"
import * as v from "valibot"

/**
 * Recipe contract for the Shift status bar. The model returns semantic design
 * knobs, not React and not concrete pixel props — the lab owns the mapping from
 * recipe to component props. Keep this in sync with the lab-side
 * `ShiftStatusBarRecipe` type in
 * `tools/theme-workshop/lab/design-pass/generated-takes.tsx`.
 */
const ShiftStatusBarRecipe = v.object({
  kind: v.literal("shift-status-bar-take-v1"),
  batteryEmphasis: v.picklist(["low", "medium", "high"]),
  networkEmphasis: v.picklist(["low", "medium", "high"]),
})

const DesignTake = v.object({
  name: v.string(),
  summary: v.string(),
  recipe: ShiftStatusBarRecipe,
})

const Output = v.object({
  takes: v.array(DesignTake),
})

const Input = v.object({
  surfaceId: v.string(),
  partId: v.string(),
  prompt: v.string(),
  count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
})

const model =
  process.env.LAB_AI_MODEL ?? "openrouter/anthropic/claude-haiku-4.5"

const instructionsFor = (input: v.InferOutput<typeof Input>): string => `
You are a design assistant for the Korri "Shift" home screen. The user is
looking at the Shift status bar — the top chrome that shows the clock, network
signal, and battery — and wants fresh design directions.

Produce exactly ${input.count} distinct take(s) for this request:
"${input.prompt}"

Each take is semantic design intent expressed through these knobs only:
- batteryEmphasis: "low" | "medium" | "high" — how loud the battery indicator is.
- networkEmphasis: "low" | "medium" | "high" — how loud the network indicator is.

Give each take a short human "name" (2-4 words) and a one-sentence "summary"
describing the feel. Make the takes meaningfully different from each other.
Return only the structured result; do not include prose, markdown, or code.
`

export default defineWorkflow({
  agent: defineAgent(() => ({ model })),
  input: Input,
  output: Output,

  async run({ harness, input }) {
    const session = await harness.session()
    const response = await session.prompt(instructionsFor(input), {
      result: Output,
    })
    return response.data
  },
})
