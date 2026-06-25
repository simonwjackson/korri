import { useInputAction } from "@platform/react/input/use-input-action"
import { Dialog } from "radix-ui"
import { type ReactNode, useEffect, useRef } from "react"
import { ShiftHudGlyph } from "../atoms/ShiftHudGlyph"
import { useShiftHome } from "../templates/ShiftHome.context"

export interface ShiftLabsPanelProps {
  readonly children?: ReactNode
}

export function ShiftLabsPanel({ children }: ShiftLabsPanelProps) {
  const { isLabsOpen, openLabs, closeLabs } = useShiftHome()
  const wasOpenRef = useRef(isLabsOpen)

  useEffect(() => {
    if (wasOpenRef.current && !isLabsOpen) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>("[data-shift-labs-trigger]")
          ?.focus()
      })
    }
    wasOpenRef.current = isLabsOpen
  }, [isLabsOpen])

  useInputAction("back", () => {
    if (isLabsOpen) closeLabs()
  })

  return (
    <Dialog.Root
      open={isLabsOpen}
      onOpenChange={open => {
        if (open) openLabs()
        else closeLabs()
      }}
    >
      <Dialog.Portal>
        <div data-shift-home className="shift-labs-portal">
          <Dialog.Overlay className="shift-labs-overlay" />
          <Dialog.Content
            className="shift-labs-panel lrud-container"
            data-block-exit="up down left right"
          >
            <div className="shift-labs-header">
              <div className="shift-labs-title-group">
                <ShiftHudGlyph>β</ShiftHudGlyph>
                <div>
                  <Dialog.Title className="shift-labs-title">Labs</Dialog.Title>
                  <Dialog.Description className="shift-labs-description">
                    Experimental controls for tuning this kiosk surface.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="shift-labs-close-button">
                  Close
                </button>
              </Dialog.Close>
            </div>
            <div className="shift-labs-content">{children}</div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
