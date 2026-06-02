import { afterEach, describe, expect, it } from "bun:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { EvierStreamControlPage } from "./EvierStreamControlPage"

const originalFetch = globalThis.fetch

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("EvierStreamControlPage", () => {
  it("renders as a development theme with separate Moonlight and Gamescope controls", async () => {
    stubFetch()

    render(<EvierStreamControlPage />)

    expect(screen.getByRole("heading", { name: /evier/i })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Moonlight stream" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Gamescope presentation" }),
    ).toBeTruthy()
    expect(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
    ).toBeTruthy()
    expect(screen.getByRole("slider", { name: "Gamescope FPS" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "FSR" })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/disabled/)).toBeTruthy())
  })

  it("debounces slider mutations against the Evier app API", async () => {
    const requests = stubFetch()
    render(<EvierStreamControlPage />)
    await waitFor(() => expect(screen.getByText(/disabled/)).toBeTruthy())

    fireEvent.change(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
      {
        target: { value: "6000" },
      },
    )
    fireEvent.change(
      screen.getByRole("slider", { name: "Moonlight bitrate" }),
      {
        target: { value: "12000" },
      },
    )

    await act(async () => {
      await Bun.sleep(650)
    })

    expect(
      requests.filter(request => request.url.includes("/moonlight/bitrate")),
    ).toEqual([
      {
        url: "/api/evier/stream/moonlight/bitrate",
        body: { bitrateKbps: 12000 },
      },
    ])
  })
})

function stubFetch() {
  const requests: Array<{ url: string; body?: unknown }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return new Response(
      JSON.stringify(
        url.endsWith("/state")
          ? {
              moonlight: { status: "disabled" },
              gamescope: { status: "disabled" },
            }
          : { ok: true },
      ),
      { headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch
  return requests
}
