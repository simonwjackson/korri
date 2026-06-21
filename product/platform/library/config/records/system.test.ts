import { describe, expect, it } from "bun:test"

import { decodeSystemPayload } from "./system"

describe("SystemPayload", () => {
  it("decodes a minimal system (every field optional)", () => {
    const system = decodeSystemPayload({})
    expect(system).toEqual({})
  })

  it("decodes system identity metadata", () => {
    const system = decodeSystemPayload({
      name: "Mega Drive",
      manufacturer: "Sega",
      aliases: ["genesis", "md"],
      metadata: { generation: 4 },
    })
    expect(system).toEqual({
      name: "Mega Drive",
      manufacturer: "Sega",
      aliases: ["genesis", "md"],
      metadata: { generation: 4 },
    })
  })

  it("rejects retired launch/app/runtime fields", () => {
    expect(() => decodeSystemPayload({ launcher: "retroarch" })).toThrow(
      /system\.launcher|Unexpected key/i,
    )
    expect(() => decodeSystemPayload({ launch: { with: {} } })).toThrow(
      /Unexpected key|launch/i,
    )
    expect(() => decodeSystemPayload({ apps: [{ id: "retroarch" }] })).toThrow(
      /Unexpected key|apps/i,
    )
    expect(() => decodeSystemPayload({ cores: { retroarch: "mgba" } })).toThrow(
      /Unexpected key|cores/i,
    )
  })

  it("rejects inherited launcher policy fields", () => {
    expect(() => decodeSystemPayload({ env: { LANG: "C" } })).toThrow()
    expect(() => decodeSystemPayload({ presets: { perf: {} } })).toThrow()
    expect(() =>
      decodeSystemPayload({ byLauncher: { retroarch: {} } }),
    ).toThrow()
    expect(() => decodeSystemPayload({ inherit: false })).toThrow()
    expect(() =>
      decodeSystemPayload({ plugin: { "@korri:retroarch": {} } }),
    ).toThrow()
  })

  it("rejects identity-field bypass: 'contentPath' is not allowed", () => {
    expect(() => decodeSystemPayload({ contentPath: "/x.smc" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeSystemPayload({ launchr: "retroarch" })).toThrow()
  })
})
