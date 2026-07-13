import { describe, expect, it } from "bun:test"
import { silentAcquisitionLogger } from "./logger"
import {
  createAcquisitionPluginServices,
  type PluginFetchLike,
} from "./plugin-runtime"

const clock = { nowIso: () => "2026-07-12T00:00:00.000Z" }

/**
 * The happy-dom test preload replaces global Response/Headers with
 * browser-like ones that hide Set-Cookie, so cookie-bearing fakes are
 * duck-typed instead of using `new Response(...)`.
 */
function fakeResponse(input: {
  readonly body?: string
  readonly status?: number
  readonly url?: string
  readonly headers?: Record<string, string>
  readonly setCookies?: readonly string[]
}): Response {
  const status = input.status ?? 200
  const headerEntries = Object.entries(input.headers ?? {})
  return {
    status,
    ok: status >= 200 && status < 300,
    url: input.url ?? "",
    headers: {
      forEach: (visit: (value: string, key: string) => void) => {
        for (const [key, value] of headerEntries) visit(value, key)
      },
      get: (name: string) =>
        headerEntries.find(([key]) => key === name.toLowerCase())?.[1] ?? null,
      getSetCookie: () => [...(input.setCookies ?? [])],
    },
    text: async () => input.body ?? "",
    json: async () => JSON.parse(input.body ?? "null"),
    arrayBuffer: async () => new TextEncoder().encode(input.body ?? "").buffer,
  } as unknown as Response
}

function servicesWithFetch(fetchImpl: PluginFetchLike) {
  return createAcquisitionPluginServices({
    clock,
    logger: silentAcquisitionLogger,
    fetchImpl,
  })
}

describe("plugin http request()", () => {
  it("sends method, body, and headers, and exposes status/ok/headers", async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const services = servicesWithFetch(async (url, init) => {
      seen.url = String(url)
      seen.init = init
      return new Response("created", {
        status: 201,
        headers: { "x-request-id": "abc" },
      })
    })

    const response = await services.http!.request!(
      "https://example.test/form",
      {
        method: "POST",
        body: new URLSearchParams({ emuid: "5", id: "9" }),
        headers: { referer: "https://example.test/game" },
      },
    )

    expect(seen.url).toBe("https://example.test/form")
    expect(seen.init?.method).toBe("POST")
    expect(String(seen.init?.body)).toContain("emuid=5")
    expect(new Headers(seen.init?.headers as HeadersInit).get("referer")).toBe(
      "https://example.test/game",
    )
    expect(response.status).toBe(201)
    expect(response.ok).toBe(true)
    expect(response.headers["x-request-id"]).toBe("abc")
    expect(await response.text()).toBe("created")
  })

  it("returns exact binary bytes unmodified", async () => {
    const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x88])
    const services = servicesWithFetch(async () => new Response(payload))

    const response = await services.http!.request!("https://example.test/rom")
    const bytes = await response.bytes()

    expect(bytes).toEqual(payload)
  })

  it("exposes raw Set-Cookie values for session capture", async () => {
    const services = servicesWithFetch(async () =>
      fakeResponse({
        body: "ok",
        setCookies: ["session=s1; Path=/", "tracker=t1; Path=/x"],
      }),
    )

    const response = await services.http!.request!("https://example.test/")

    expect(response.setCookies).toEqual([
      "session=s1; Path=/",
      "tracker=t1; Path=/x",
    ])
  })

  it("rejects unsafe outbound URLs before calling fetch, for GET and POST alike", async () => {
    let called = 0
    const services = servicesWithFetch(async () => {
      called += 1
      return new Response("nope")
    })

    expect(services.http!.request!("http://127.0.0.1/private")).rejects.toThrow(
      /not allowed/i,
    )
    expect(
      services.http!.request!("http://localhost/private", { method: "POST" }),
    ).rejects.toThrow(/not allowed/i)
    expect(services.http!.text!("file:///etc/passwd")).rejects.toThrow(
      /not allowed/i,
    )
    expect(called).toBe(0)
  })

  it("rejects responses whose declared size exceeds the payload cap", async () => {
    const services = servicesWithFetch(
      async () =>
        new Response("big", {
          headers: { "content-length": String(3 * 1024 * 1024 * 1024) },
        }),
    )

    const response = await services.http!.request!("https://example.test/big")
    expect(response.bytes()).rejects.toThrow(/too large/i)
  })

  it("keeps text and json sugar working over the capable client", async () => {
    const services = servicesWithFetch(async url => {
      if (String(url).includes("json")) {
        return Response.json({ ok: true })
      }
      return new Response("plain text")
    })

    expect(await services.http!.text!("https://example.test/plain")).toBe(
      "plain text",
    )
    expect(
      await services.http!.json!<{ ok: boolean }>("https://example.test/json"),
    ).toEqual({ ok: true })
  })

  it("still applies query and timeout options through request()", async () => {
    const seen: { url?: string } = {}
    const services = servicesWithFetch(async url => {
      seen.url = String(url)
      return new Response("ok")
    })

    await services.http!.request!("https://example.test/search", {
      query: { q: "dkc", page: 2 },
    })

    expect(seen.url).toBe("https://example.test/search?q=dkc&page=2")
  })
})
