import { describe, expect, test } from "bun:test"
import { renderWaitingPage } from "./render-waiting-page"

const HELP_DELAY_MS = 30_000

describe("renderWaitingPage", () => {
  test("searching: title is generic and body has the Ethernet hint", () => {
    const since = new Date("2026-05-24T11:58:00.000Z")
    const helpAfter = new Date(since.getTime() + HELP_DELAY_MS)
    const html = renderWaitingPage(
      {
        status: "searching",
        since: since.toISOString(),
        helpAfter: helpAfter.toISOString(),
      },
      since.getTime(),
    )

    expect(html).toContain("Looking for a Korri server")
    expect(html).toContain("Ethernet")
  })

  test("reconnecting: title names the remembered host id", () => {
    const since = new Date("2026-05-24T11:58:00.000Z")
    const helpAfter = new Date(since.getTime() + HELP_DELAY_MS)
    const html = renderWaitingPage(
      {
        status: "reconnecting",
        server: { hostId: "aka", controlUrl: "http://192.168.1.117:3001" },
        since: since.toISOString(),
        helpAfter: helpAfter.toISOString(),
      },
      since.getTime(),
    )

    expect(html).toContain("Looking for aka")
  })

  test("help block omitted when now < helpAfter", () => {
    const since = new Date("2026-05-24T11:58:00.000Z")
    const helpAfter = new Date(since.getTime() + HELP_DELAY_MS)
    const html = renderWaitingPage(
      {
        status: "searching",
        since: since.toISOString(),
        helpAfter: helpAfter.toISOString(),
      },
      since.getTime() + 1_000, // 1s in, well before helpAfter (30s)
    )

    expect(html).not.toContain("Still searching")
    expect(html).not.toContain("waiting-help")
  })

  test("help block included when now >= helpAfter", () => {
    const since = new Date("2026-05-24T11:58:00.000Z")
    const helpAfter = new Date(since.getTime() + HELP_DELAY_MS)
    const html = renderWaitingPage(
      {
        status: "searching",
        since: since.toISOString(),
        helpAfter: helpAfter.toISOString(),
      },
      helpAfter.getTime() + 1, // just past the help threshold
    )

    expect(html).toContain("Still searching")
  })

  test("unparseable helpAfter is treated as immediately visible", () => {
    const since = new Date("2026-05-24T11:58:00.000Z")
    const html = renderWaitingPage(
      {
        status: "searching",
        since: since.toISOString(),
        helpAfter: "not-a-date",
      },
      since.getTime(),
    )

    expect(html).toContain("Still searching")
  })
})
