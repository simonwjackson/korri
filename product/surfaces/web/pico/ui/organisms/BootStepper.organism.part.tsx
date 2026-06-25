import { PICO_BOOT_STEPS } from "../../fixtures-extra"
import type { StorySpec } from "../../story-spec"
import { BootStepper } from "./BootStepper"

export default {
  render: () => <BootStepper steps={PICO_BOOT_STEPS} />,
} satisfies StorySpec
