import { describe, expect, it } from "bun:test"
import { notifyRendererReady } from "./renderer-ready"

describe("notifyRendererReady", () => {
  it("posts a readiness beacon with the current location", () => {
    const calls: unknown[] = []
    notifyRendererReady({
      location: { href: "http://127.0.0.1:8099/" },
      fetch: ((...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve(new Response(null, { status: 204 }))
      }) as typeof fetch,
    })

    expect(calls).toEqual([
      [
        "/__korri/renderer-ready",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ href: "http://127.0.0.1:8099/" }),
        },
      ],
    ])
  })

  it("is a no-op when fetch is unavailable", () => {
    expect(() =>
      notifyRendererReady({ location: { href: "http://127.0.0.1:8099/" } }),
    ).not.toThrow()
  })
})
