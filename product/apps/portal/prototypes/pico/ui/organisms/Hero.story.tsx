import type { StorySpec } from "../../story-spec"
import { Btn } from "../atoms/Btn"
import { Hero } from "./Hero"

export default {
  surface: true, // centered full-state column — reads best in a framed canvas
  render: () => (
    <Hero
      glyph="✓"
      glyphTone="good"
      title="ALL DONE"
      message="a reusable centered state for loading / error / empty / confirm."
    >
      <Btn kind="primary" sel>
        CONTINUE
      </Btn>
    </Hero>
  ),
} satisfies StorySpec
