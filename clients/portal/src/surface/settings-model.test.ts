import { describe, expect, it } from "bun:test"
import type { SettingsSnapshot } from "@contracts/generated/korrid"
import { type DeviceFacts, settingsFrom } from "./settings-model"

const configuration: SettingsSnapshot = {
  revision: "r1",
  deviceName: "usu",
  plugins: [
    { id: "@korri:mgba", title: "mGBA", enabled: true },
    { id: "@korri:retroarch", title: "RetroArch", enabled: false },
  ],
}

const group = (facts: DeviceFacts, title: string) =>
  settingsFrom(facts).find(candidate => candidate.title === title)

describe("settingsFrom", () => {
  it("always provides the native pairing entry point", () => {
    const pairing = group({}, "Streaming")?.items.at(-1)
    expect(pairing).toMatchObject({
      label: "Pair or manage devices",
      interaction: { kind: "action", actionId: "pairing" },
    })
  })

  it("makes the device name a bounded text setting", () => {
    expect(group({ settings: configuration }, "Device")?.items[0]).toMatchObject({
      id: "device-name",
      value: "usu",
      interaction: { kind: "text", maxLength: 64 },
    })
  })

  it("makes plugin enablement an On/Off choice", () => {
    expect(group({ settings: configuration }, "Plugins")?.items).toEqual([
      {
        id: "@korri:mgba",
        label: "mGBA",
        value: "On",
        interaction: {
          kind: "choice",
          choices: [
            { value: "true", label: "On" },
            { value: "false", label: "Off" },
          ],
        },
      },
      {
        id: "@korri:retroarch",
        label: "RetroArch",
        value: "Off",
        interaction: {
          kind: "choice",
          choices: [
            { value: "true", label: "On" },
            { value: "false", label: "Off" },
          ],
        },
      },
    ])
  })

  it("states permissions and links each one to Android", () => {
    expect(
      group(
        { storage: { _tag: "Denied" }, notice: { _tag: "Hidden" } },
        "Permissions",
      )?.items,
    ).toEqual([
      {
        id: "file-access",
        label: "File access",
        value: "Not granted",
        description: "Managed by Android",
        interaction: { kind: "action", actionId: "storage-access" },
      },
      {
        id: "background-notice",
        label: "Background notice",
        value: "Hidden",
        description: "Managed by Android",
        interaction: { kind: "action", actionId: "background-notice" },
      },
    ])
  })

  it("does not call a failed permission query denied", () => {
    expect(
      group(
        { storage: { _tag: "QueryFailed", message: "boom" } },
        "Permissions",
      )?.items[0]?.value,
    ).toBe("Unknown")
  })

  it("counts paired devices, names them, and keeps management last", () => {
    const streaming = group(
      {
        hosts: [
          { uuid: "a", name: "zao", paired: true },
          { uuid: "b", name: "stranger", paired: false },
        ],
      },
      "Streaming",
    )
    expect(streaming?.items.map(item => [item.label, item.value])).toEqual([
      ["Paired devices", "1 device"],
      ["zao", "Paired"],
      ["Pair or manage devices", undefined],
    ])
  })

  it("explains that game count comes from library.yaml", () => {
    const game = group({ localGameCount: 1 }, "Games")?.items[0]
    expect(game?.value).toBe("1 game")
    expect(game?.description).toBe("Declared in library.yaml")
  })

  it("publishes Android, app, and korrid identity as read-only facts", () => {
    const system = group(
      {
        version: "korrid-v0",
        systemInfo: {
          _tag: "SystemInfo",
          payload: {
            device: "RG405M",
            manufacturer: "Anbernic",
            androidRelease: "14",
            sdk: 34,
            appVersion: "1.2.3",
          },
        },
      },
      "System information",
    )
    expect(system?.items.map(item => [item.label, item.value])).toEqual([
      ["Device", "Anbernic RG405M"],
      ["Android", "14 · SDK 34"],
      ["Korri app", "1.2.3"],
      ["korrid", "korrid-v0"],
    ])
    expect(system?.items.every(item => item.interaction === undefined)).toBe(true)
  })
})
