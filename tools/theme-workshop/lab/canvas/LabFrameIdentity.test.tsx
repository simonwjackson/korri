import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { LabFrameIdentity } from "./LabFrameIdentity"

afterEach(() => cleanup())

describe("LabFrameIdentity", () => {
  it("shows path and search together", () => {
    render(<LabFrameIdentity path="/library" search="?lens=favorites" />)
    expect(screen.getByLabelText("Frame route").textContent).toBe(
      "/library?lens=favorites",
    )
  })

  it("shows the path alone when there is no search", () => {
    render(<LabFrameIdentity path="/game/celeste" />)
    expect(screen.getByLabelText("Frame route").textContent).toBe(
      "/game/celeste",
    )
  })

  it("normalizes a search string missing its leading question mark", () => {
    render(<LabFrameIdentity path="/library" search="lens=genre" />)
    expect(screen.getByLabelText("Frame route").textContent).toBe(
      "/library?lens=genre",
    )
  })
})
