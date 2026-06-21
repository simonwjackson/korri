import type { StorySpec } from "../../story-spec"
import { Glyph } from "./Glyph"

export default {
  note: "good / bad / info",
  render: () => (
    <>
      <Glyph tone="good">✓</Glyph>
      <Glyph tone="bad">✕</Glyph>
      <Glyph tone="info">⚠</Glyph>
    </>
  ),
} satisfies StorySpec
