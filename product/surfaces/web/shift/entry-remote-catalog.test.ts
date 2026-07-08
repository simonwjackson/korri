import { describe, expect, it } from "bun:test"
import { searchRemoteCatalogViaSameOriginRpc } from "./entry"

describe("Shift remote catalog entry bridge", () => {
  it("searches remote catalogs through same-origin /api/rpc", async () => {
    const calls: readonly [string | URL | Request, RequestInit | undefined][] =
      []
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      ;(calls as [string | URL | Request, RequestInit | undefined][]).push([
        input,
        init,
      ])
      return Response.json([
        {
          _tag: "Exit",
          requestId: "1",
          exit: {
            _tag: "Success",
            value: {
              claims: [
                {
                  _tag: "ProviderClaim",
                  providerId: "@korri:pico8",
                  id: "73825",
                  title: "porklike",
                  url: "https://www.lexaloffle.com/bbs/?pid=73825#p",
                  thumbnailUrl:
                    "https://www.lexaloffle.com/bbs/thumbs/pico8_porklike-2.png",
                },
              ],
            },
          },
        },
      ])
    }

    const result = await searchRemoteCatalogViaSameOriginRpc(
      { query: "ball" },
      fetchImpl as typeof fetch,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe("/api/rpc")
    expect(calls[0]?.[1]?.method).toBe("POST")
    expect(calls[0]?.[1]?.headers).toEqual({
      "content-type": "application/json",
    })
    const body = JSON.parse(String(calls[0]?.[1]?.body))
    expect(body).toMatchObject([
      {
        _tag: "Request",
        id: "1",
        tag: "app.acquisition.search",
        payload: { query: "ball" },
        traceId: "00000000000000000000000000000000",
        spanId: "0000000000000000",
      },
    ])
    expect(BigInt(body[0].id)).toBe(1n)
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]).toMatchObject({
      providerId: "@korri:pico8",
      title: "porklike",
      thumbnailUrl:
        "https://www.lexaloffle.com/bbs/thumbs/pico8_porklike-2.png",
    })
  })
})
