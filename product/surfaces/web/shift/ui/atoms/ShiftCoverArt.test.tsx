import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { ShiftCoverArt } from "./ShiftCoverArt"

afterEach(() => cleanup())

describe("ShiftCoverArt", () => {
  it("renders the cover image when art is present", () => {
    const { container } = render(
      <ShiftCoverArt src="hk.png" title="Hollow Knight" />,
    )
    const img = container.querySelector("img")
    expect(img).toBeTruthy()
    expect(img?.getAttribute("src")).toBe("hk.png")
    expect(container.querySelector(".shift-monogram")).toBeNull()
  })

  it("self-selects the title monogram when art is absent", () => {
    const { container } = render(<ShiftCoverArt src="" title="Hollow Knight" />)
    expect(container.querySelector("img")).toBeNull()
    const monogram = container.querySelector(".shift-monogram-initials")
    expect(monogram?.textContent).toBe("HK")
  })
})
