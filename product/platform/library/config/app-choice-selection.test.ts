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
          { id: "plugin-app", argsAppend: ["system-plugin-app"] },
        ],
        [{ id: "retroarch", runtime: "mgba", argsAppend: ["release"] }],
      ),
    ).toEqual([
      { id: "retroarch", runtime: "mgba", argsAppend: ["system", "release"] },
      { id: "plugin-app", argsAppend: ["system-plugin-app"] },
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

  it("merges provider launch companion policies by app choice id", () => {
    expect(
      resolveEffectiveAppChoices(
        [
          {
            id: "retroarch",
            launch: {
              with: {
                "@fixture:frame": {
                  backend: { type: "wayland" },
                  display: { nested: { width: 854 } },
                  extraArgs: ["--rt"],
                },
              },
            },
          },
        ],
        [
          {
            id: "retroarch",
            launch: {
              with: {
                "@fixture:frame": {
                  backend: { allowDeferred: true },
                  display: { nested: { height: 480 } },
                  extraArgs: ["--hdr-enabled"],
                },
              },
            },
          },
        ],
      ),
    ).toEqual([
      {
        id: "retroarch",
        launch: {
          with: {
            "@fixture:frame": {
              backend: { type: "wayland", allowDeferred: true },
              display: { nested: { width: 854, height: 480 } },
              extraArgs: ["--rt", "--hdr-enabled"],
            },
          },
        },
      },
    ])
  })

  it("merges Steam app choice extras and launch options", () => {
    expect(
      resolveEffectiveAppChoices(
        [
          {
            id: "steam",
            extra: { args: ["-silent"] },
            "launch-options": "wrapper -- %command%",
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
        "launch-options": "wrapper -- %command%",
      },
    ])
  })

  it("auto-selects one choice and requires appId for many choices", () => {
    expect(selectAppChoice([{ id: "retroarch" }])).toEqual({
      _tag: "SelectedAppChoice",
      choice: { id: "retroarch" },
    })
    expect(selectAppChoice([{ id: "retroarch" }, { id: "plugin-app" }])).toEqual({
      _tag: "AmbiguousAppChoice",
      appIds: ["retroarch", "plugin-app"],
    })
  })

  it("selects an explicit appId and reports unknown ids", () => {
    expect(
      selectAppChoice([{ id: "retroarch" }, { id: "plugin-app" }], "plugin-app"),
    ).toEqual({ _tag: "SelectedAppChoice", choice: { id: "plugin-app" } })
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
