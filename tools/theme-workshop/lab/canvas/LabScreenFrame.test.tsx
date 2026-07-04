import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { LabScreenFrame } from "./LabScreenFrame"

afterEach(cleanup)

const frameEl = () =>
  document.querySelector<HTMLElement>(".lab-compose-screen-frame")

const framePx = (dim: "width" | "height"): number =>
  Number.parseInt(frameEl()?.style[dim] ?? "0", 10)

describe("LabScreenFrame", () => {
  it("sizes the content box to the given physical px", () => {
    render(
      <LabScreenFrame width={1439} height={809}>
        <div>part body</div>
      </LabScreenFrame>,
    )
    expect(framePx("width")).toBe(1439)
    expect(framePx("height")).toBe(809)
  })

  it("renders the part content and a corner resize handle", () => {
    render(
      <LabScreenFrame width={300} height={180}>
        <div>part body</div>
      </LabScreenFrame>,
    )
    expect(screen.getByText("part body")).toBeTruthy()
    expect(screen.getByLabelText("Resize preview frame")).toBeTruthy()
  })
})
