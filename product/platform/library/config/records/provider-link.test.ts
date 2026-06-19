import { describe, expect, it } from "bun:test"

import { decodeProviderLinkPayload } from "./provider-link"

describe("ProviderLinkPayload", () => {
  it("decodes one or more scoped provider refs", () => {
    const link = decodeProviderLinkPayload({
      provider: "@korri:steam",
      playable: "downwell",
      release: "windows",
      refs: [
        { kind: "external-id", value: "360740", scope: "release" },
        {
          kind: "provider-item-id",
          value: "disc-2-id",
          scope: "targetPart",
          targetPart: "disc2",
        },
      ],
    })

    expect(link.refs.map(ref => ref.value)).toEqual(["360740", "disc-2-id"])
    expect(link.refs[1]?.targetPart).toBe("disc2")
  })

  it("rejects retired singular ref records", () => {
    expect(() =>
      decodeProviderLinkPayload({
        provider: "@korri:steam",
        playable: "downwell",
        release: "windows",
        ref: { kind: "external-id", value: "360740" },
      }),
    ).toThrow()
  })

  it("rejects empty refs arrays", () => {
    expect(() =>
      decodeProviderLinkPayload({
        provider: "@korri:steam",
        playable: "downwell",
        refs: [],
      }),
    ).toThrow()
  })
})
