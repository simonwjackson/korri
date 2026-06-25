import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { ShiftLabsButton } from "../molecules/ShiftLabsButton"
import { ShiftHomeTopBar } from "./ShiftHomeTopBar"

afterEach(() => cleanup())

describe("ShiftHomeTopBar", () => {
  it("places trailing actions to the right of the clock", () => {
    render(
      <ShiftHomeTopBar
        time="9:41"
        avatarSrc="https://picsum.photos/seed/avatar/96/96"
        trailingActions={<ShiftLabsButton onActivate={() => {}} />}
      />,
    )

    const labs = screen.getByRole("button", { name: "Labs" })
    const time = screen.getByText("9:41")

    expect(
      time.compareDocumentPosition(labs) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("renders the existing search and status layout without trailing actions", () => {
    render(
      <ShiftHomeTopBar
        time="9:41"
        avatarSrc="https://picsum.photos/seed/avatar/96/96"
      />,
    )

    expect(
      screen.getByRole("button", { name: "Search for games, genres, or tags" }),
    ).toBeTruthy()
    expect(screen.getByText("9:41")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Labs" })).toBeNull()
  })
})
