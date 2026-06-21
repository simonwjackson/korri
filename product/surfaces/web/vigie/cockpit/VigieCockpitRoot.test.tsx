import { beforeEach, describe, expect, it } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { vigieCockpitFixture } from "../fixtures/cockpit-fixtures"
import { useVigieCockpit } from "./VigieCockpit.context"
import { VigieCockpitRoot } from "./VigieCockpitRoot"

function DeviceProbe() {
  const { device, selectDevice } = useVigieCockpit()
  return (
    <button type="button" onClick={() => selectDevice("fuji")}>
      {device.name} · {device.role} · {device.id}
    </button>
  )
}

describe("VigieCockpitRoot device selection", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("makes the picked fleet member the active device", () => {
    const screen = render(
      <VigieCockpitRoot fixture={vigieCockpitFixture}>
        <DeviceProbe />
      </VigieCockpitRoot>,
    )

    const button = screen.getByRole("button")
    expect(button.textContent).toContain("Bandai")
    expect(button.textContent).toContain("bandai")

    fireEvent.click(button)

    expect(button.textContent).toContain("Fuji")
    expect(button.textContent).toContain("fuji")
  })

  it("persists the picked device across a remount", () => {
    const first = render(
      <VigieCockpitRoot fixture={vigieCockpitFixture}>
        <DeviceProbe />
      </VigieCockpitRoot>,
    )
    fireEvent.click(first.getByRole("button"))
    expect(first.getByRole("button").textContent).toContain("fuji")
    first.unmount()

    const second = render(
      <VigieCockpitRoot fixture={vigieCockpitFixture}>
        <DeviceProbe />
      </VigieCockpitRoot>,
    )
    expect(second.getByRole("button").textContent).toContain("Fuji")
    expect(second.getByRole("button").textContent).toContain("fuji")
  })

  it("ignores an unknown device id and keeps the current device", () => {
    function UnknownProbe() {
      const { device, selectDevice } = useVigieCockpit()
      return (
        <button type="button" onClick={() => selectDevice("nope")}>
          {device.id}
        </button>
      )
    }

    const screen = render(
      <VigieCockpitRoot fixture={vigieCockpitFixture}>
        <UnknownProbe />
      </VigieCockpitRoot>,
    )

    const button = screen.getByRole("button")
    fireEvent.click(button)

    expect(button.textContent).toBe("bandai")
  })
})
