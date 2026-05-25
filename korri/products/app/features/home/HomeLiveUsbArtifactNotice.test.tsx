import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "bun:test"
import { HomeLiveUsbArtifactNotice } from "./HomeLiveUsbArtifactNotice"

afterEach(() => cleanup())

describe("HomeLiveUsbArtifactNotice", () => {
  it("shows a visible Developer ISO marker", () => {
    render(<HomeLiveUsbArtifactNotice artifact="developer" />)

    expect(screen.getByText("Developer ISO")).toBeTruthy()
    expect(screen.getByText(/broad persistence/i)).toBeTruthy()
  })

  it("does not add a Product ISO marker", () => {
    const { container } = render(
      <HomeLiveUsbArtifactNotice artifact="product" />,
    )

    expect(container.textContent).toBe("")
  })

  it("does not add a marker outside live USB runtime config", () => {
    const { container } = render(<HomeLiveUsbArtifactNotice />)

    expect(container.textContent).toBe("")
  })
})
