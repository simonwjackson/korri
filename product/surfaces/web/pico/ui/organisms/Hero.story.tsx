import type { StorySpec } from "../../story-spec"
import { Btn } from "../atoms/Btn"
import { Hero } from "./Hero"

export default {
  presentation: "surface", // centered full-state column — reads best in a framed canvas
  render: () => (
    <Hero
      glyph="✓"
      glyphTone="good"
      title="ALL DONE"
      message="a reusable centered state for loading / error / empty / confirm."
    >
      <Btn kind="primary" state="selected">
        CONTINUE
      </Btn>
    </Hero>
  ),
} satisfies StorySpec
