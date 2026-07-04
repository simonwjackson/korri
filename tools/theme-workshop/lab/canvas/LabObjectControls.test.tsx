import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DeviceConfig } from "../../device-lab"
import { LabObjectControls } from "./LabObjectControls"

afterEach(cleanup)

const devices: readonly DeviceConfig[] = [
  { id: "rg353m", name: "RG353M", widthMm: 72, heightMm: 52 },
  { id: "tv65", name: '65" TV', widthMm: 1439, heightMm: 809, bezel: false },
]

const baseProps = {
  name: "Home",
  layer: "page",
  devices,
  width: 720,
  height: 405,
  canPromote: false,
  canDelete: false,
  onStartMove: () => undefined,
  onDeviceChange: () => undefined,
  onPromote: () => undefined,
  onDelete: () => undefined,
  onRemove: () => undefined,
}

describe("LabObjectControls", () => {
  it("shows the part identity and its resolution", () => {
    render(<LabObjectControls {...baseProps} />)
    expect(screen.getByText("Home")).toBeTruthy()
    expect(document.querySelector(".lab-object-res")?.textContent).toBe(
      "720×405",
    )
  })

  it("lists every device plus Fit and reports the chosen one per part", () => {
    const onDeviceChange = mock((_deviceId: string | null) => undefined)
    render(<LabObjectControls {...baseProps} onDeviceChange={onDeviceChange} />)
    const select = screen.getByLabelText(
      "Preview frame device size",
    ) as HTMLSelectElement
    const labels = [...select.options].map(option => option.textContent)
    expect(labels[0]).toBe("Fit to screen")
    expect(labels).toContain('65" TV · 1439×809mm')

    fireEvent.change(select, { target: { value: "tv65" } })
    expect(onDeviceChange).toHaveBeenCalledWith("tv65")
  })

  it("starts a move from the grip and closes from the remove button", () => {
    const onStartMove = mock(() => undefined)
    const onRemove = mock(() => undefined)
    render(
      <LabObjectControls
        {...baseProps}
        onStartMove={onStartMove}
        onRemove={onRemove}
      />,
    )
    fireEvent.pointerDown(screen.getByLabelText("Move Home"))
    fireEvent.click(screen.getByLabelText("Remove Home"))
    expect(onStartMove).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })
})
