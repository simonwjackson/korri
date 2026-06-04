import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { launchViaSessiond } from "./sessiond-launcher-client"

const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

describe("sessiond launcher client", () => {
  it("posts a launch spec with the configured capability token", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      token: "secret",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(requests[0].input).toBe("http://127.0.0.1:3003/launch")
    expect(
      (requests[0].init?.headers as Record<string, string>)[
        "x-korri-sessiond-token"
      ],
    ).toBe("secret")
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ spec })
  })

  it("returns a failed launch when sessiond is unreachable", async () => {
    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      token: "secret",
      fetchImpl: async () => {
        throw new Error("connection refused")
      },
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(125)
      expect(result.stderrTail).toContain("connection refused")
    }
  })

  it("returns a failed launch when sessiond rejects the capability", async () => {
    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      token: "bad-token",
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(126)
      expect(result.stderrTail).toContain("401")
    }
  })
})
