import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LAB_AXIS_LIVE, type LabStateAxis } from "../model/lab-state-axis"
import { LabStatesPanel } from "./LabStatesPanel"

afterEach(() => cleanup())

const liveSingle = { kind: "single" as const, value: LAB_AXIS_LIVE }
const liveMulti = { kind: "multi" as const, on: new Set<string>() }

function axes(): readonly LabStateAxis[] {
  return [
    {
      id: "data",
      kind: "single",
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
      kind: "single",
      label: "Launch",
      liveLabel: "Auto",
      states: [
        { id: "Idle", label: "Idle" },
        { id: "Launching", label: "Launching" },
      ],
      pin: () => {},
      release: () => {},
      parent: { axisId: "data", whenStates: ["Ready"] },
      disabledHint: "Only while Data = Ready",
    },
    {
      id: "overlays",
      kind: "multi",
      label: "Overlays",
      liveLabel: "Auto",
      states: [
        { id: "Notice", label: "Notice" },
        { id: "Toast", label: "Toast" },
      ],
      pin: () => {},
      release: () => {},
    },
  ]
}

const noop = () => {}

const noopPin = (_: string, __: string) => {}
const noopLive = (_: string) => {}

describe("LabStatesPanel axis groups", () => {
  it("renders parentless axes as separate region groups", () => {
    const { container } = render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: liveSingle,
          launch: liveSingle,
          overlays: liveMulti,
        }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Data")).toBeTruthy()
    expect(screen.getByText("Overlays")).toBeTruthy()
    expect(container.querySelectorAll(".pt-axis-region")).toHaveLength(2)
  })

  it("pins a single axis when a state chip is clicked", () => {
    const onPin = mock((_: string, __: string) => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: { kind: "single", value: "Ready" },
          launch: liveSingle,
          overlays: liveMulti,
        }}
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
        activeByAxis={{
          data: { kind: "single", value: "Empty" },
          launch: liveSingle,
          overlays: liveMulti,
        }}
        onPin={noopPin}
        onLive={onLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    const autoButtons = screen.getAllByRole("button", { name: "Auto" })
    expect(autoButtons.length).toBeGreaterThan(0)
    fireEvent.click(autoButtons[0])
    expect(onLive).toHaveBeenCalledWith("data")
  })

  it("hides a nested axis until its parent state enables it", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: { kind: "single", value: "Empty" },
          launch: liveSingle,
          overlays: liveMulti,
        }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(screen.queryByText("Launch")).toBeNull()
    expect(screen.queryByRole("button", { name: "Launching" })).toBeNull()
  })

  it("reveals a nested axis once its parent state enables it", () => {
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: { kind: "single", value: "Ready" },
          launch: liveSingle,
          overlays: liveMulti,
        }}
        onPin={noopPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    expect(screen.getByText("Launch")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Launching" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it("renders multi axes as checkboxes that can hold multiple active states", () => {
    const onPin = mock((_: string, __: string) => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: liveSingle,
          launch: liveSingle,
          overlays: { kind: "multi", on: new Set(["Notice", "Toast"]) },
        }}
        onPin={onPin}
        onLive={noopLive}
        states={[]}
        activeId=""
        onSelect={noop}
      />,
    )

    const notice = screen.getByRole("checkbox", { name: "Notice" })
    const toast = screen.getByRole("checkbox", { name: "Toast" })
    expect(notice.getAttribute("aria-checked")).toBe("true")
    expect(toast.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(notice)
    expect(onPin).toHaveBeenCalledWith("overlays", "Notice")
  })

  it("captures the current coordinate when Pin current is clicked", () => {
    const onPinCurrent = mock(() => undefined)
    render(
      <LabStatesPanel
        axes={axes()}
        activeByAxis={{
          data: liveSingle,
          launch: liveSingle,
          overlays: liveMulti,
        }}
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
        activeByAxis={{
          data: liveSingle,
          launch: liveSingle,
          overlays: liveMulti,
        }}
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
