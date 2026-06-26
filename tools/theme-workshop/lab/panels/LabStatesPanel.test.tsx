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
      liveLabel: "Live",
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
      liveLabel: "Live",
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

describe("LabStatesPanel axis groups", () => {
  it("renders one group per axis with its machine states", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: LAB_AXIS_LIVE, launch: LAB_AXIS_LIVE }}
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
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Empty" }))
    expect(onPin).toHaveBeenCalledWith("data", "Empty")
  })

  it("releases an axis when its Live chip is clicked", () => {
    const onLive = mock((_: string) => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Empty", launch: LAB_AXIS_LIVE }}
        onLive={onLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    // The first "Live" chip belongs to the Data axis.
    fireEvent.click(screen.getAllByRole("button", { name: "Live" })[0]!)
    expect(onLive).toHaveBeenCalledWith("data")
  })

  it("greys the Launch axis and disables its chips unless Data is Ready", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{ data: "Empty", launch: LAB_AXIS_LIVE }}
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

  it("falls back to flat states when the surface has no axes", () => {
    render(
      <LabStatesPanel
        axes={[]}
        states={[{ id: "Ready", label: "Ready" }]}
        activeId="Ready"
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Ready")).toBeTruthy()
    expect(screen.queryByText("Data")).toBeNull()
  })
})
