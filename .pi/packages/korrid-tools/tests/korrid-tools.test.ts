import { afterEach, describe, expect, it } from "bun:test"
import register, { normalizeKorridRpcUrl } from "../extensions/korrid-tools"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("korrid-tools Pi package", () => {
  it("registers read-only and mutating tools with confirmation fields", () => {
    const tools: Array<{
      readonly name: string
      readonly parameters: unknown
    }> = []
    register({
      registerTool: tool =>
        tools.push({ name: tool.name, parameters: tool.parameters }),
    })

    expect(tools.map(tool => tool.name)).toEqual([
      "korrid_query",
      "korrid_launch_game",
      "korrid_stop_session",
    ])
    expect(JSON.stringify(tools[0].parameters)).toContain("source-status")
    expect(JSON.stringify(tools[0].parameters)).toContain("rpc")
    expect(JSON.stringify(tools[1].parameters)).toContain("confirmLaunch")
    expect(JSON.stringify(tools[2].parameters)).toContain("confirmStop")
  })

  it("normalizes host, base URL, and RPC URL inputs", () => {
    expect(normalizeKorridRpcUrl("bandai")).toBe("http://bandai:3001/api/rpc")
    expect(normalizeKorridRpcUrl("http://bandai:3001")).toBe(
      "http://bandai:3001/api/rpc",
    )
    expect(normalizeKorridRpcUrl("http://bandai:3001/api/rpc")).toBe(
      "http://bandai:3001/api/rpc",
    )
  })

  it("supports allowlisted read-only raw rpc queries", async () => {
    let body = ""
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      body = String(init?.body)
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: { _tag: "Success", value: { ok: true } },
      })
    }) as typeof fetch

    const tool = registeredTool("korrid_query")
    const result = await tool.execute("call-1", {
      command: "rpc",
      tag: "app.source.list",
      payload: { compact: true },
      url: "http://bandai:3001",
    })

    expect(result).toMatchObject({ details: { ok: true } })
    expect(JSON.parse(body)).toMatchObject({
      tag: "app.source.list",
      payload: { compact: true },
    })
  })

  it("rejects mutating launch without explicit confirmation", async () => {
    const tool = registeredTool("korrid_launch_game")

    const result = await tool.execute("call-1", { id: "snes/echo.smc" })

    expect(result).toMatchObject({ isError: true })
    expect(JSON.stringify(result)).toContain("explicit confirmation")
  })

  it("sends distinct raw HTTP RPC request ids", async () => {
    const bodies: string[] = []
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(String(init?.body))
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: { _tag: "Success", value: { ok: true } },
      })
    }) as typeof fetch

    const tool = registeredTool("korrid_query")
    await tool.execute("call-1", {
      command: "status",
      url: "http://bandai:3001",
    })
    await tool.execute("call-2", {
      command: "status",
      url: "http://bandai:3001",
    })

    const ids = bodies.map(body => JSON.parse(body).id)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids.every(id => /^\d+$/.test(id))).toBe(true)
  })
})

type RegisteredTool = Parameters<
  Parameters<typeof register>[0]["registerTool"]
>[0]

function registeredTool(name: string): RegisteredTool {
  const tools: RegisteredTool[] = []
  register({ registerTool: tool => tools.push(tool) })
  const tool = tools.find(candidate => candidate.name === name)
  if (!tool) throw new Error(`tool not registered: ${name}`)
  return tool
}
