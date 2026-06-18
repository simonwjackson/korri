import { describe, expect, it } from "bun:test"
import { get, type IncomingMessage } from "node:http"
import { createKorrid, getKorridConfig } from "./korrid"

function createRecordingPluginDaemon() {
  let starts = 0
  let stops = 0
  return {
    starts: () => starts,
    stops: () => stops,
    start: async () => {
      starts += 1
    },
    stop: async () => {
      stops += 1
    },
  }
}

describe("korrid", () => {
  it("reads conservative loopback defaults", () => {
    const config = getKorridConfig({})

    expect(config).toEqual({
      host: "127.0.0.1",
      port: 3001,
      advertise: true,
      advertiseName: undefined,
      advertiseHostId: undefined,
      advertiseCapabilities: ["source", "stream"],
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
    const server = createKorrid({
      config: {
        host: "127.0.0.1",
        port: 0,
        advertise: true,
        advertiseName: "Korri Stream on aka",
        advertiseHostId: "aka",
        advertiseCapabilities: ["source", "stream"],
      },
      advertise: options => {
        advertised.push(options)
        return {
          stop: async () => {
            stopped = true
          },
        }
      },
      pluginDaemons: [createRecordingPluginDaemon()],
    })

    await server.start()
    await server.stop()

    expect(advertised).toEqual([
      {
        name: "Korri Stream on aka",
        hostId: "aka",
        port: 0,
        capabilities: ["source", "stream"],
      },
    ])
    expect(stopped).toBe(true)
  })

  it("starts and stops plugin daemons with the daemon", async () => {
    const pluginDaemon = createRecordingPluginDaemon()
    const server = createKorrid({
      config: {
        host: "127.0.0.1",
        port: 0,
        advertise: false,
        advertiseCapabilities: ["stream"],
      },
      pluginDaemons: [pluginDaemon],
    })

    await server.start()
    expect(pluginDaemon.starts()).toBe(1)

    await server.stop()
    expect(pluginDaemon.stops()).toBe(1)
  })

  it("closes the HTTP server when advertisement startup fails", async () => {
    const server = createKorrid({
      config: {
        host: "127.0.0.1",
        port: 0,
        advertise: true,
        advertiseCapabilities: ["stream"],
      },
      advertise: () => {
        throw new Error("mdns failed")
      },
      pluginDaemons: [createRecordingPluginDaemon()],
    })

    await expect(server.start()).rejects.toThrow("mdns failed")
    await server.stop()
  })

  it("bounds shutdown when an HTTP client keeps an event stream open", async () => {
    const port = await reservePort()
    const server = createKorrid({
      config: {
        host: "127.0.0.1",
        port,
        advertise: false,
        advertiseCapabilities: ["stream"],
      },
      pluginDaemons: [createRecordingPluginDaemon()],
      closeServerTimeoutMs: 50,
    })

    await server.start()
    const stream = await openEventStream(port)
    expect(stream.statusCode).toBe(200)

    try {
      await expect(
        Promise.race([
          server.stop().then(() => "stopped" as const),
          wait(1_000).then(() => "timeout" as const),
        ]),
      ).resolves.toBe("stopped")
    } finally {
      stream.destroy()
    }
  })
})

async function reservePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") })
  const port = server.port ?? 0
  server.stop(true)
  await wait(10)
  return port
}

function openEventStream(port: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = get(
      `http://127.0.0.1:${port}/api/config/events`,
      response => {
        response.pause()
        resolve(response)
      },
    )
    request.once("error", reject)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
