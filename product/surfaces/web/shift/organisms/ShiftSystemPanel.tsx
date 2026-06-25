import { useInputAction } from "@platform/react/input/use-input-action"
import { Dialog } from "radix-ui"
import { type ReactNode, useEffect, useRef } from "react"
import { ShiftHudGlyph } from "../atoms/ShiftHudGlyph"
import { useShiftHome } from "../templates/ShiftHome.context"

export interface ShiftSystemPanelProps {
  readonly children?: ReactNode
}

export function ShiftSystemPanel({ children }: ShiftSystemPanelProps) {
  const { isSystemPanelOpen, closeSystemPanel } = useShiftHome()
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(isSystemPanelOpen)

  useEffect(() => {
    if (!wasOpenRef.current && isSystemPanelOpen) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
    }
    if (wasOpenRef.current && !isSystemPanelOpen) {
      const target = restoreFocusRef.current
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus()
      })
    }
    wasOpenRef.current = isSystemPanelOpen
  }, [isSystemPanelOpen])

  useInputAction("back", () => {
    if (isSystemPanelOpen) closeSystemPanel()
  })

  return (
    <Dialog.Root
      open={isSystemPanelOpen}
      onOpenChange={open => !open && closeSystemPanel()}
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
                <ShiftHudGlyph>⚙</ShiftHudGlyph>
                <div>
                  <Dialog.Title className="shift-labs-title">
                    System
                  </Dialog.Title>
                  <Dialog.Description className="shift-labs-description">
                    Device controls for the active session.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="shift-labs-close-button">
                  Close
                </button>
              </Dialog.Close>
            </div>
            <div className="shift-labs-content">
              {children ?? (
                <p>
                  Use System shortcuts for workspace, brightness, and display
                  actions.
                </p>
              )}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
