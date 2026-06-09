import { describe, expect, it } from "bun:test"
import type { LaunchSpec } from "@platform/library/launcher"
import { launchViaSessiond } from "./sessiond-launcher-client"

const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }

describe("sessiond launcher client", () => {
  it("posts a launch spec over the configured Unix socket", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await launchViaSessiond(spec, {
      socketPath: "/run/user/2000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(requests[0].input).toBe("http://korri-sessiond/launch")
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/2000/korri/sessiond.sock",
    )
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ spec })
  })

  it("returns a failed launch when sessiond is unreachable", async () => {
    const result = await launchViaSessiond(spec, {
      socketPath: "/run/user/2000/korri/sessiond.sock",
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

  it("returns a failed launch when sessiond rejects the request", async () => {
    const result = await launchViaSessiond(spec, {
      socketPath: "/run/user/2000/korri/sessiond.sock",
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(125)
      expect(result.stderrTail).toContain("403")
    }
  })
})
