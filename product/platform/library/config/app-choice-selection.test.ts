import { describe, expect, it } from "bun:test"

import {
  resolveEffectiveAppChoices,
  selectAppChoice,
} from "./app-choice-selection"

describe("app choice selection", () => {
  it("overlays release choices onto system choices by id", () => {
    expect(
      resolveEffectiveAppChoices(
        [
          { id: "retroarch", runtime: "snes9x", argsAppend: ["system"] },
          { id: "ryubing", argsAppend: ["system-ryubing"] },
        ],
        [{ id: "retroarch", runtime: "mgba", argsAppend: ["release"] }],
      ),
    ).toEqual([
      { id: "retroarch", runtime: "mgba", argsAppend: ["system", "release"] },
      { id: "ryubing", argsAppend: ["system-ryubing"] },
    ])
  })

  it("lets inherit false reset the matching inherited choice", () => {
    expect(
      resolveEffectiveAppChoices(
        [{ id: "retroarch", runtime: "snes9x", argsAppend: ["system"] }],
        [{ id: "retroarch", inherit: false, argsAppend: ["release"] }],
      ),
    ).toEqual([{ id: "retroarch", inherit: false, argsAppend: ["release"] }])
  })

  it("merges Steam app choice extras and launch options", () => {
    expect(
      resolveEffectiveAppChoices(
        [
          {
            id: "steam",
            extra: { args: ["-silent"] },
            "launch-options": "gamescope -- %command%",
          },
        ],
        [
          {
            id: "steam",
            extra: { args: ["-forcedesktopscaling", "1.25"] },
          },
        ],
      ),
    ).toEqual([
      {
        id: "steam",
        extra: { args: ["-silent", "-forcedesktopscaling", "1.25"] },
        "launch-options": "gamescope -- %command%",
      },
    ])
  })

  it("auto-selects one choice and requires appId for many choices", () => {
    expect(selectAppChoice([{ id: "retroarch" }])).toEqual({
      _tag: "SelectedAppChoice",
      choice: { id: "retroarch" },
    })
    expect(selectAppChoice([{ id: "retroarch" }, { id: "ryubing" }])).toEqual({
      _tag: "AmbiguousAppChoice",
      appIds: ["retroarch", "ryubing"],
    })
  })

  it("selects an explicit appId and reports unknown ids", () => {
    expect(
      selectAppChoice([{ id: "retroarch" }, { id: "ryubing" }], "ryubing"),
    ).toEqual({ _tag: "SelectedAppChoice", choice: { id: "ryubing" } })
    expect(selectAppChoice([{ id: "retroarch" }], "missing")).toEqual({
      _tag: "AppChoiceNotFound",
      appId: "missing",
      appIds: ["retroarch"],
    })
  })

  it("reports no choice when neither system nor release contributes one", () => {
    expect(selectAppChoice([])).toEqual({ _tag: "NoAppChoice" })
  })
})
