import { describe, expect, it } from "bun:test"
import { type DeviceFacts, settingsFrom } from "./settings-model"

const titles = (facts: DeviceFacts) =>
  settingsFrom(facts).map(group => group.title)

const items = (facts: DeviceFacts, title: string) =>
  settingsFrom(facts)
    .find(group => group.title === title)
    ?.items.map(item => [item.label, item.value])

describe("settingsFrom", () => {
  it("says nothing at all when Korri has learned nothing", () => {
    // A settings screen full of "Unknown" is worse than no screen: it looks
    // broken rather than early.
    expect(settingsFrom({})).toEqual([])
  })

  it("omits a group whose only fact is missing", () => {
    expect(titles({ version: "korrid 0.4.1" })).toEqual(["Device"])
  })

  it("states permissions in the user's terms, not the shell's", () => {
    expect(
      items({ storage: { _tag: "Denied" }, notice: { _tag: "Hidden" } },
        "Permissions"),
    ).toEqual([
      ["File access", "Not granted"],
      ["Background notice", "Hidden"],
    ])
  })

  it("reports a failed permission query as unknown rather than denied", () => {
    // Claiming "Not granted" when the question failed would send the user to
    // a settings screen to fix something that may not be broken.
    expect(
      items({ storage: { _tag: "QueryFailed", message: "boom" } },
        "Permissions"),
    ).toEqual([["File access", "Unknown"]])
  })

  it("counts only paired devices, and names each one", () => {
    expect(
      items(
        {
          hosts: [
            { uuid: "a", name: "zao", paired: true },
            { uuid: "b", name: "aka", paired: true },
            { uuid: "c", name: "stranger", paired: false },
          ],
        },
        "Streaming",
      ),
    ).toEqual([
      ["Paired devices", "2 devices"],
      ["zao", "Paired"],
      ["aka", "Paired"],
    ])
  })

  it("says None rather than 0 when nothing is paired", () => {
    expect(items({ hosts: [] }, "Streaming")).toEqual([
      ["Paired devices", "None"],
    ])
  })

  it("explains where the game count comes from, since Korri does not scan", () => {
    const group = settingsFrom({ localGameCount: 1 }).find(
      entry => entry.title === "Games",
    )
    expect(group?.items[0]?.value).toBe("1 game")
    expect(group?.items[0]?.description).toBe("Declared in library.yaml")
  })

  it("pluralises counts", () => {
    expect(items({ localGameCount: 0 }, "Games")).toEqual([
      ["On this device", "0 games"],
    ])
    expect(items({ localGameCount: 3 }, "Games")).toEqual([
      ["On this device", "3 games"],
    ])
  })

  it("offers no way to change anything", () => {
    // Read-only is the contract, not an accident of the current data: no item
    // may carry a command until Korri may write the user's configuration.
    const everything = settingsFrom({
      version: "korrid 0.4.1",
      storage: { _tag: "Granted" },
      notice: { _tag: "Visible" },
      hosts: [{ uuid: "a", name: "zao", paired: true }],
      localGameCount: 2,
    })
    const keys = new Set(
      everything.flatMap(group => group.items.flatMap(Object.keys)),
    )
    expect([...keys].sort()).toEqual(["description", "id", "label", "value"])
  })
})
