import { describe, expect, it } from "bun:test"
import { createKorriServer, getKorriServerConfig } from "./korri-server"

describe("korri server", () => {
  it("reads conservative loopback defaults", () => {
    const config = getKorriServerConfig({})

    expect(config).toEqual({
      host: "127.0.0.1",
      port: 3001,
      advertise: true,
      advertiseName: undefined,
      advertiseHostId: undefined,
      advertiseCapabilities: ["stream", "source"],
    })
  })

  it("starts the HTTP server and optional advertisement together", async () => {
    const advertised: Array<{
      readonly name?: string
      readonly hostId?: string
      readonly port: number
      readonly capabilities: readonly string[]
    }> = []
    let stopped = false
    const server = createKorriServer({
      config: {
        host: "127.0.0.1",
        port: 0,
        advertise: true,
        advertiseName: "Korri Stream on aka",
        advertiseHostId: "aka",
        advertiseCapabilities: ["stream", "source"],
      },
      advertise: options => {
        advertised.push(options)
        return {
          stop: async () => {
            stopped = true
          },
        }
      },
    })

    await server.start()
    await server.stop()

    expect(advertised).toEqual([
      {
        name: "Korri Stream on aka",
        hostId: "aka",
        port: 0,
        capabilities: ["stream", "source"],
      },
    ])
    expect(stopped).toBe(true)
  })

  it("closes the HTTP server when advertisement startup fails", async () => {
    const server = createKorriServer({
      config: {
        host: "127.0.0.1",
        port: 0,
        advertise: true,
        advertiseCapabilities: ["stream"],
      },
      advertise: () => {
        throw new Error("mdns failed")
      },
    })

    await expect(server.start()).rejects.toThrow("mdns failed")
    await server.stop()
  })
})
