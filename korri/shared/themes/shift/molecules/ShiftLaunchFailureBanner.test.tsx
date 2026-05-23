import { describe, expect, it } from "bun:test"
import { fireEvent, render, screen } from "@testing-library/react"

import { ShiftLaunchFailureBanner } from "./ShiftLaunchFailureBanner"

describe("ShiftLaunchFailureBanner", () => {
  it("renders the supplied gameTitle", () => {
    render(<ShiftLaunchFailureBanner gameTitle="Hades" onRetry={() => {}} />)
    expect(screen.getByRole("alert").textContent).toContain("Hades")
  })

  it("describes Moonlight failures distinctly from generic launch failures", () => {
    render(
      <ShiftLaunchFailureBanner
        gameTitle="Hades"
        exitCode={125}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByRole("alert").textContent).toContain("Moonlight")
  })

  it("describes prepare/control failures distinctly from Moonlight failures", () => {
    render(
      <ShiftLaunchFailureBanner
        gameTitle="Hades"
        exitCode={126}
        onRetry={() => {}}
      />,
    )
    const text = screen.getByRole("alert").textContent ?? ""
    expect(text).toContain("server")
    expect(text).not.toContain("Moonlight")
  })

  it("includes the exit code in the message when provided", () => {
    render(
      <ShiftLaunchFailureBanner
        gameTitle="Hades"
        exitCode={7}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByRole("alert").textContent).toContain("exit 7")
  })

  it("omits the exit-code suffix when exitCode is undefined", () => {
    render(<ShiftLaunchFailureBanner gameTitle="Hades" onRetry={() => {}} />)
    expect(screen.getByRole("alert").textContent).not.toMatch(/exit\s+\d+/)
  })

  it("calls onRetry exactly once when the retry button is clicked", () => {
    let count = 0
    render(
      <ShiftLaunchFailureBanner
        gameTitle="Hades"
        onRetry={() => {
          count++
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /retry/i }))
    expect(count).toBe(1)
  })

  it("moves focus to the retry button on first render", () => {
    render(<ShiftLaunchFailureBanner gameTitle="Hades" onRetry={() => {}} />)
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /retry/i }),
    )
  })

  it("renders a Dismiss button when onDismiss is provided and calls it on click", () => {
    let dismissed = 0
    render(
      <ShiftLaunchFailureBanner
        gameTitle="Hades"
        onRetry={() => {}}
        onDismiss={() => {
          dismissed++
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))
    expect(dismissed).toBe(1)
  })

  it("does not render a Dismiss button when onDismiss is omitted", () => {
    render(<ShiftLaunchFailureBanner gameTitle="Hades" onRetry={() => {}} />)
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull()
  })

  it("does not crash with a long gameTitle", () => {
    const longTitle =
      "A Very Long Game Title That Could Potentially Wrap Across Lines and Stress the Banner Layout"
    render(
      <ShiftLaunchFailureBanner gameTitle={longTitle} onRetry={() => {}} />,
    )
    expect(screen.getByRole("alert").textContent).toContain(longTitle)
  })
})
