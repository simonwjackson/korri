import type { SessionControls } from "@contracts/generated/korrid"
import type {
  SurfaceGameplayControl,
  SurfaceGameplayControlGroup,
  SurfaceGameplayControlInteraction,
  SurfaceGameplayOverlayPresentation,
} from "@contracts/surface/korri-surface"

const RESUME_CONTROL: SurfaceGameplayControl = {
  id: "overlay:resume",
  label: "Resume",
  enabled: true,
  destructive: false,
  dismissOnSuccess: true,
  interaction: { kind: "command" },
}

function presentationInteraction(
  interaction: SessionControls["groups"][number]["controls"][number]["interaction"],
): SurfaceGameplayControlInteraction {
  switch (interaction.kind) {
    case "command":
      return { kind: "command" }
    case "toggle":
      return { kind: "toggle", value: interaction.payload.value }
    case "choice":
      return {
        kind: "choice",
        value: interaction.payload.value,
        options: interaction.payload.options,
      }
    case "range":
      return { kind: "range", ...interaction.payload }
  }
}

function presentationControl(
  control: SessionControls["groups"][number]["controls"][number],
): SurfaceGameplayControl {
  return {
    id: control.id,
    label: control.label,
    ...(control.description === undefined
      ? {}
      : { description: control.description }),
    enabled: control.enabled,
    ...(control.disabledReason === undefined
      ? {}
      : { disabledReason: control.disabledReason }),
    destructive: control.destructive,
    dismissOnSuccess: control.dismissOnSuccess,
    interaction: presentationInteraction(control.interaction),
  }
}

function presentationGroup(
  group: SessionControls["groups"][number],
): SurfaceGameplayControlGroup | undefined {
  if (group.controls.length === 0) return undefined
  return {
    id: group.id,
    label: group.label,
    controls: group.controls.map(presentationControl),
  }
}

/** Strip active-session and integration authority while translating korrid's
 * materialized controls into the only model Shift is allowed to receive. */
export function gameplayOverlayPresentationFrom(
  controls: SessionControls,
): SurfaceGameplayOverlayPresentation {
  const groups = controls.groups
    .map(presentationGroup)
    .filter((group): group is SurfaceGameplayControlGroup => group !== undefined)

  return {
    kind: "gameplay-overlay",
    ...(controls.title === undefined ? {} : { title: controls.title }),
    controls: [RESUME_CONTROL],
    groups,
  }
}
