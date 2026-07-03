import { type CSSProperties } from "react"
import type { Story } from "../../types"
import { useLab } from "../Lab.context"
import { LabPreviewBoundary } from "../model/lab-preview-boundary"
import { LabScaledPreview } from "./LabScaledPreview"

const FRAME_WIDTH = 900

/**
 * Renders one discovered part for an isolated preview (gallery card, selection
 * artboard, canvas object). It does three things a bare
 * `story.render()` does not:
 *  1. Applies the surface's style scope (adapter.previewScope) so tokens and
 *     recipes resolve outside a full mount — e.g. pico's [data-pico] scope.
 *  2. Gives full-screen parts (surface: true) a definite, device-shaped frame
 *     so their fill/flex layout resolves instead of collapsing.
 *  3. Scales the result to fit its stage and catches render errors.
 */
export function LabPartPreview({
  story,
  label,
  fill = false,
}: {
  readonly story: Story
  readonly label?: string
  readonly fill?: boolean
}) {
  const { adapter } = useLab()
  const node = story.render()

  // A surface that provides its own preview scope (e.g. pico) returns a
  // concretely-sized, correctly-scoped container, so just scale it to fit.
  if (adapter.previewScope) {
    return (
      <LabScaledPreview fill={fill}>
        <LabPreviewBoundary label={label ?? story.name}>
          {adapter.previewScope(node)}
        </LabPreviewBoundary>
      </LabScaledPreview>
    )
  }

  const boundary = (
    <LabPreviewBoundary label={label ?? story.name}>{node}</LabPreviewBoundary>
  )
  if (!story.surface) {
    return <LabScaledPreview fill={fill}>{boundary}</LabScaledPreview>
  }

  // Self-scoping surfaces (e.g. shift) still need a definite, device-shaped box
  // so their full-screen parts lay out instead of collapsing.
  const device = adapter.devices[0]
  const ratio =
    device && device.heightMm > 0 ? device.widthMm / device.heightMm : 16 / 10
  const frameStyle: CSSProperties = {
    width: FRAME_WIDTH,
    height: Math.round(FRAME_WIDTH / ratio),
  }
  return (
    <LabScaledPreview fill={fill}>
      <div className="lab-screen-frame" style={frameStyle}>
        {boundary}
      </div>
    </LabScaledPreview>
  )
}
