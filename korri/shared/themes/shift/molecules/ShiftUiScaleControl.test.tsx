import { afterEach, describe, expect, it } from "bun:test"
import { MAX_UI_SCALE } from "@shared/primitives/theme/ui-scale"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShiftUiScaleControl } from "./ShiftUiScaleControl"

afterEach(() => cleanup())

describe("ShiftUiScaleControl", () => {
  it("emits parsed values and updates the visible percent label", () => {
    const changes: number[] = []
    const { rerender } = render(
      <ShiftUiScaleControl value={1} onChange={scale => changes.push(scale)} />,
    )

    fireEvent.change(screen.getByRole("slider", { name: "UI scale" }), {
      target: { value: "1.15" },
    })

    expect(changes).toEqual([1.15])

    rerender(
      <ShiftUiScaleControl
        value={1.15}
        onChange={scale => changes.push(scale)}
      />,
    )

    expect(screen.getByText("115%")).toBeTruthy()
  })

  it("clamps out-of-range prop values for the rendered control", () => {
    render(<ShiftUiScaleControl value={99} onChange={() => {}} />)

    const slider = screen.getByRole("slider", {
      name: "UI scale",
    }) as HTMLInputElement

    expect(slider.value).toBe(String(MAX_UI_SCALE))
    expect(screen.getByText("150%")).toBeTruthy()
  })

  it("exposes a native slider with bounds", () => {
    render(<ShiftUiScaleControl value={1} onChange={() => {}} />)

    const slider = screen.getByRole("slider", {
      name: "UI scale",
    }) as HTMLInputElement

    expect(slider.min).toBe("0.75")
    expect(slider.max).toBe("1.5")
    expect(slider.step).toBe("0.05")
  })

  it("calls onReset when the reset button is enabled", () => {
    let resets = 0
    render(
      <ShiftUiScaleControl
        value={1.15}
        onChange={() => {}}
        onReset={() => (resets += 1)}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Reset" }))

    expect(resets).toBe(1)
  })
})
