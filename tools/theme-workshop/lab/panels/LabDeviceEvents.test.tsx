import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { LabSurfaceEvent } from "../surface-registry"
import { LabDeviceEvents } from "./LabDeviceEvents"

afterEach(cleanup)

const batteryEvent: LabSurfaceEvent = {
  id: "battery",
  label: "Battery",
  payload: {
    kind: "select",
    options: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
  },
  defaultPayload: "low",
  emit: () => undefined,
}

describe("LabDeviceEvents", () => {
  it("renders nothing when there are no events", () => {
    const { container } = render(
      <LabDeviceEvents events={[]} onEmit={() => undefined} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("emits the drafted payload when Send is pressed", () => {
    const onEmit = mock(() => undefined)
    render(<LabDeviceEvents events={[batteryEvent]} onEmit={onEmit} />)

    fireEvent.change(screen.getByLabelText("Battery event payload"), {
      target: { value: "high" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send Battery event" }))

    expect(onEmit).toHaveBeenCalledTimes(1)
    expect(onEmit).toHaveBeenLastCalledWith("battery", "high")
  })
})
