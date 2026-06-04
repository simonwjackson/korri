import { afterEach, describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { ShiftHomeCtx } from "../templates/ShiftHome.context"
import { ShiftHomeCaption } from "./ShiftHomeCaption"

const focused: GameRecord = {
  id: "chrono-trigger",
  system: "fixture",
  contentPath: "/storage/fixtures/chrono-trigger.rom",
  metadata: { name: "Chrono Trigger" },
  userData: { lastPlayed: new Date(Date.now() - 60_000) },
}

afterEach(() => cleanup())

describe("ShiftHomeCaption", () => {
  it("keeps only the runtime focus transform inline", () => {
    const { container } = render(
      <ShiftHomeCtx.Provider
        value={{
          items: [focused],
          resumeTarget: focused,
          focused,
          isResumeFocused: true,
          captionAnchorX: 42,
          railRef: createRef<HTMLDivElement>(),
          isLabsOpen: false,
          isSystemPanelOpen: false,
          uiScale: 1,
          focusTile: () => {},
          openLabs: () => {},
          closeLabs: () => {},
          openSystemPanel: () => {},
          closeSystemPanel: () => {},
          changeUiScale: () => {},
          resetUiScale: () => {},
        }}
      >
        <ShiftHomeCaption />
      </ShiftHomeCtx.Provider>,
    )

    expect(screen.getByText("Chrono Trigger")).toBeTruthy()
    const caption = container.querySelector<HTMLElement>(".shift-home-caption")
    expect(caption?.style.transform).toBe("translateX(42px)")
    expect(caption?.style.length).toBe(1)
  })
})
