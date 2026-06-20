import type { StorySpec } from "../../story-spec"
import { Btn } from "./Btn"

export default {
  name: "Button",
  note: "default / primary / danger",
  render: () => (
    <>
      <Btn>PLAIN</Btn> <Btn kind="primary">PLAY</Btn>{" "}
      <Btn kind="danger">QUIT</Btn>
    </>
  ),
} satisfies StorySpec
