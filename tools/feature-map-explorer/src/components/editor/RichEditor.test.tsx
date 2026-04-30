import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { render, waitFor } from "@testing-library/react"
import { RichEditor } from "./RichEditor"

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tools/feature-map-explorer/src/components/editor/markdown/fixtures",
)

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf-8")
}

describe("RichEditor", () => {
  it("renders markdown content without emitting onChange on mount", async () => {
    const changes: string[] = []
    const screen = render(
      <RichEditor
        value="# Hello\n\nBody"
        onChange={next => changes.push(next)}
      />,
    )

    await waitFor(() => {
      const editor = screen.getByTestId("rich-editor-content")
      expect(editor.textContent).toContain("Hello")
      expect(editor.textContent).toContain("Body")
    })
    expect(changes).toEqual([])
  })

  it("renders the brief table fixture in rich mode", async () => {
    const screen = render(
      <RichEditor value={fixture("brief-body.md")} onChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByText("SGR-O1")).toBeTruthy()
      expect(screen.getByText("Progress safety")).toBeTruthy()
    })
  })

  it("updates displayed content when the external value changes without emitting onChange", async () => {
    const changes: string[] = []
    const screen = render(
      <RichEditor value="# First" onChange={next => changes.push(next)} />,
    )

    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())
    screen.rerender(
      <RichEditor value="# Second" onChange={next => changes.push(next)} />,
    )

    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy())
    expect(changes).toEqual([])
  })

  it("renders raw-only warning for unsupported Markdown", () => {
    const screen = render(
      <RichEditor value='<Widget name="Resume" />' onChange={() => {}} />,
    )

    expect(screen.getByText("Rich editor unavailable")).toBeTruthy()
    expect(
      screen.getByText("MDX/JSX tags are not supported in Rich mode."),
    ).toBeTruthy()
  })
})
