import type {
  SurfaceGameplayControl,
  SurfaceGameplayControlValue,
  SurfaceGameplayOverlayPresentation,
  SurfaceStatus,
} from "@contracts/surface/korri-surface"
import { useSurfaceAction, useSurfaceHost } from "../../host/surface-host"
import { ShiftSheetAction } from "../molecules/ShiftSheetAction"
import { ShiftSheetChoice } from "../molecules/ShiftSheetChoice"
import { ShiftSheetRange } from "../molecules/ShiftSheetRange"
import { ShiftSheetToggle } from "../molecules/ShiftSheetToggle"
import { ShiftSheetBody } from "./ShiftSheetBody"
import { ShiftSheetGroup } from "./ShiftSheetGroup"
import { ShiftSheetHeader } from "./ShiftSheetHeader"
import { ShiftSheetPanel } from "./ShiftSheetPanel"
import { ShiftSheetRoot } from "./ShiftSheetRoot"
import { ShiftSheetTitle } from "./ShiftSheetTitle"

export interface ShiftGameplayOverlaySheetProps {
  readonly presentation: SurfaceGameplayOverlayPresentation
  readonly status: SurfaceStatus
}

function GameplayControl({ control }: { readonly control: SurfaceGameplayControl }) {
  const host = useSurfaceHost()
  const invoke = (value?: SurfaceGameplayControlValue) =>
    host.invokeGameplayControl(control.id, value)

  switch (control.interaction.kind) {
    case "command":
      return (
        <ShiftSheetAction
          label={control.label}
          controlId={control.id}
          description={control.description}
          disabled={!control.enabled}
          disabledReason={control.disabledReason}
          tone={control.destructive ? "danger" : "default"}
          onSelect={() => invoke()}
        />
      )
    case "toggle":
      return (
        <ShiftSheetToggle
          control={{ ...control, interaction: control.interaction }}
          onChange={value => invoke({ kind: "toggle", value })}
        />
      )
    case "choice":
      return (
        <ShiftSheetChoice
          control={{ ...control, interaction: control.interaction }}
          onChange={value => invoke({ kind: "choice", value })}
        />
      )
    case "range":
      return (
        <ShiftSheetRange
          control={{ ...control, interaction: control.interaction }}
          onChange={value => invoke({ kind: "range", value })}
        />
      )
  }
}

/** The running-game presentation, composed from the same literal Sheet parts as host selection. */
export function ShiftGameplayOverlaySheet({
  presentation,
  status,
}: ShiftGameplayOverlaySheetProps) {
  const host = useSurfaceHost()
  const dismiss = () => host.dismissGameplayOverlay()
  useSurfaceAction("system", dismiss)

  const title = presentation.title ?? "Gameplay"
  return (
    <ShiftSheetRoot
      open
      onClose={dismiss}
      label={`Gameplay controls for ${title}`}
    >
      <ShiftSheetPanel>
        <ShiftSheetHeader>
          <ShiftSheetTitle>{title}</ShiftSheetTitle>
        </ShiftSheetHeader>
        <ShiftSheetBody>
          <ShiftSheetGroup title="Gameplay">
            {presentation.controls.map(control => (
              <ShiftSheetAction
                key={control.id}
                label={control.label}
                controlId={control.id}
                description={control.description}
                disabled={!control.enabled}
                disabledReason={control.disabledReason}
                tone={control.destructive ? "danger" : "default"}
                onSelect={dismiss}
              />
            ))}
          </ShiftSheetGroup>
          {presentation.groups.map(group => (
            <ShiftSheetGroup key={group.id} title={group.label}>
              {group.controls.map(control => (
                <GameplayControl key={control.id} control={control} />
              ))}
            </ShiftSheetGroup>
          ))}
          {status._tag === "Problem" ? (
            <ShiftSheetGroup title={status.kicker}>
              <p className="shift-gameplay-overlay-problem">{status.reason}</p>
              {status.canRetry ? (
                <ShiftSheetAction label="Retry" onSelect={() => host.retry()} />
              ) : null}
            </ShiftSheetGroup>
          ) : null}
        </ShiftSheetBody>
      </ShiftSheetPanel>
    </ShiftSheetRoot>
  )
}
