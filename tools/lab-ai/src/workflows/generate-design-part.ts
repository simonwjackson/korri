import { defineAgent, defineWorkflow } from "@flue/runtime"
import * as v from "valibot"

/**
 * Lightweight "generate real parts" workflow: the model authors complete
 * `.part.tsx` files that the dev-lab discovers as new pickable parts. The lab
 * writes each returned file into `product/surfaces/web/<surface>/ai-takes/` and
 * Vite surfaces it. The model composes the REAL Shift components, so takes can
 * differ structurally/visually — not just by a few props.
 *
 * Files are validated (create-only, import-allowlisted) on the lab side before
 * they are written.
 */
const DesignPart = v.object({
  name: v.string(),
  slug: v.pipe(
    v.string(),
    v.regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be kebab-case"),
  ),
  summary: v.string(),
  tsx: v.string(),
})

const Output = v.object({ parts: v.array(DesignPart) })

const Input = v.object({
  surfaceId: v.string(),
  partId: v.string(),
  prompt: v.string(),
  count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
})

const model = process.env.LAB_AI_MODEL ?? "openai-codex/gpt-5.5"

const instructionsFor = (input: v.InferOutput<typeof Input>): string => `
You are a UI engineer for the Korri "Shift" home screen. The user is looking at
the Shift status bar (top chrome: clock, network, battery, avatar) and wants
fresh design directions realized as REAL components.

Author ${input.count} distinct part file(s) for this request:
"${input.prompt}"

Each part is a complete TypeScript React file placed at
product/surfaces/web/shift/ai-takes/<slug>.molecule.part.tsx

FILE CONTRACT (follow exactly):
- Default-export an object: { name: string, note: "AI take", render: () => JSX }.
- Wrap the visual in <ShiftPartFrame>…</ShiftPartFrame>.
- You MAY only import from these exact paths (no others, no new packages):
    import { ShiftPartFrame } from "../ui/ShiftPartFrame"
    import { ShiftStatusBar } from "../ui/molecules/ShiftStatusBar"
    import { ShiftClock } from "../ui/atoms/ShiftClock"
    import { ShiftBattery } from "../ui/atoms/ShiftBattery"
    import { ShiftNetworkIcon } from "../ui/atoms/ShiftNetworkIcon"
    import { ShiftAvatar } from "../ui/atoms/ShiftAvatar"
- Beyond those components you may use plain HTML elements with inline style={{…}}
  to express layout, spacing, background, and rhythm. No other imports.

COMPONENT SIGNATURES:
- ShiftPartFrame({ children })
- ShiftStatusBar({ time?: string; avatarSrc?: string;
    network?: { _tag: "Connected"; strengthPercent: number } | { _tag: "Disconnected" };
    battery?: { level?: "full" | "medium" | "low"; charging?: boolean } })
- ShiftClock({ time: string })
- ShiftBattery({ level?: "full" | "medium" | "low"; charging?: boolean })
- ShiftNetworkIcon({ network: { _tag: "Connected"; strengthPercent: number } | { _tag: "Disconnected" } })
- ShiftAvatar({ src: string })

Make the takes genuinely different from each other in composition/layout/feel —
recompose the atoms, don't just tweak one prop. Give each a short human "name",
a "summary" of the direction, and a unique kebab-case "slug".
Return ONLY the structured result. Each "tsx" must be a complete, valid file.
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
