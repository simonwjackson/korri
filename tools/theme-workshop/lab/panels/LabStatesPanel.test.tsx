import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LAB_AXIS_LIVE, type LabStateAxis } from "../model/lab-state-axis"
import { LabStatesPanel } from "./LabStatesPanel"

afterEach(() => cleanup())

function axes(): readonly LabStateAxis[] {
  return [
    {
      id: "data",
      label: "Data",
      liveLabel: "Auto",
      states: [
        { id: "Loading", label: "Loading" },
        { id: "Ready", label: "Ready" },
        { id: "Empty", label: "Empty" },
      ],
      pin: () => {},
      release: () => {},
    },
    {
      id: "launch",
      label: "Launch",
      liveLabel: "Auto",
      states: [
        { id: "Idle", label: "Idle" },
        { id: "Launching", label: "Launching" },
      ],
      pin: () => {},
      release: () => {},
      enabledWhen: active => active.data === "Ready",
      disabledHint: "Only while Data = Ready",
    },
  ]
}

const noop = () => {}

const noopPin = (_: string, __: string) => {}
const noopLive = (_: string) => {}

describe("LabStatesPanel axis groups", () => {
  it("renders one group per axis with its machine states", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: LAB_AXIS_LIVE, launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Data")).toBeTruthy()
    expect(screen.getByText("Launch")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Empty" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Launching" })).toBeTruthy()
  })

  it("pins an axis when a state chip is clicked", () => {
    const onPin = mock((_: string, __: string) => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Ready", launch: LAB_AXIS_LIVE }}
        onPin={onPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Empty" }))
    expect(onPin).toHaveBeenCalledWith("data", "Empty")
  })

  it("releases an axis when its Auto chip is clicked", () => {
    const onLive = mock((_: string) => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Empty", launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={onLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    // The first "Auto" chip belongs to the Data axis.
    const autoButtons = screen.getAllByRole("button", { name: "Auto" })
    expect(autoButtons.length).toBeGreaterThan(0)
    fireEvent.click(autoButtons[0])
    expect(onLive).toHaveBeenCalledWith("data")
  })

  it("greys the Launch axis and disables its chips unless Data is Ready", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Empty", launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Only while Data = Ready")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Launching" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it("enables Launch chips once Data is Ready", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Ready", launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(
      (screen.getByRole("button", { name: "Launching" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    expect(screen.queryByText("Only while Data = Ready")).toBeNull()
  })

  it("captures the current coordinate when Pin current is clicked", () => {
    const onPinCurrent = mock(() => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: LAB_AXIS_LIVE, launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={noopLive}
        onPinCurrent={onPinCurrent}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Pin current" }))
    expect(onPinCurrent).toHaveBeenCalledTimes(1)
  })

  it("omits Pin current when the surface cannot capture a coordinate", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: LAB_AXIS_LIVE, launch: LAB_AXIS_LIVE }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )
    expect(screen.queryByRole("button", { name: "Pin current" })).toBeNull()
  })

  it("falls back to flat states when the surface has no axes", () => {
    render(
      <LabStatesPanel
        axes={[]}
        activeByAxis={{}}
        onPin={noopPin}
        onLive={noopLive}
        states={[{ id: "Ready", label: "Ready" }]}
        activeId="Ready"
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Ready")).toBeTruthy()
    expect(screen.queryByText("Data")).toBeNull()
  })
})
