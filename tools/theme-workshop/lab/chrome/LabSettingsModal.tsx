import { CreditCard, Monitor, X } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { LabDeviceSetup } from "../panels/LabDeviceSetup"
import { LabScaleCalibrator } from "../panels/LabScaleCalibrator"

type LabSettingsSection = {
  readonly id: string
  readonly label: string
  readonly icon: ReactNode
  readonly render: () => ReactNode
}

const SECTIONS: readonly LabSettingsSection[] = [
  {
    id: "devices",
    label: "Devices",
    icon: <Monitor size={16} strokeWidth={2} aria-hidden />,
    render: () => <LabDeviceSetup />,
  },
  {
    id: "scale",
    label: "Scale",
    icon: <CreditCard size={16} strokeWidth={2} aria-hidden />,
    render: () => <LabScaleCalibrator />,
  },
]

/**
 * Settings modal for lab configuration you don't touch full-time. Left icon+label
 * nav (selected = filled pill), top-left close, right pane per section. Sections
 * are data-driven — add to SECTIONS to grow the surface.
 */
export function LabSettingsModal({
  open,
  onClose,
}: {
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [sectionId, setSectionId] = useState(SECTIONS[0].id)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const active =
    SECTIONS.find(section => section.id === sectionId) ?? SECTIONS[0]

  return (
    <div
      className="pt-settings-root"
      role="dialog"
      aria-modal="true"
      aria-label="Lab settings"
    >
      <button
        type="button"
        className="pt-settings-scrim"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div className="pt-settings">
        <nav className="pt-settings-nav" aria-label="Settings sections">
          <button
            type="button"
            className="pt-settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2.2} aria-hidden />
          </button>
          {SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              className={`pt-settings-navitem${section.id === active.id ? " is-on" : ""}`}
              aria-current={section.id === active.id}
              onClick={() => setSectionId(section.id)}
            >
              <span className="pt-settings-navicon">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
        <div className="pt-settings-pane">
          <h2 className="pt-settings-title">{active.label}</h2>
          <div className="pt-settings-body">{active.render()}</div>
        </div>
      </div>
    </div>
  )
}
