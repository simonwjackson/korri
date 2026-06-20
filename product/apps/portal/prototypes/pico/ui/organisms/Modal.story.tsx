import type { StorySpec } from "../../story-spec"
import { Dim } from "../atoms/Dim"
import { Modal } from "./Modal"

export default {
  surface: true, // full overlay over a dimmed game backdrop
  render: () => (
    <Modal
      title="QUIT TO LIBRARY?"
      hints={[
        { key: "a", label: "QUIT" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <Dim>unsaved progress will be lost.</Dim>
    </Modal>
  ),
} satisfies StorySpec
