import { describe, expect, it } from "bun:test"
import type { Service } from "bonjour-service"
import { advertiseStreamHost } from "./lan-stream-advertise"

describe("LAN stream advertisement", () => {
  it("publishes a Korri stream mDNS service with versioned capabilities", async () => {
    let published: unknown
    let stopped = false
    let destroyed = false

    const advertisement = advertiseStreamHost({
      name: "Korri on aka",
      hostId: "aka",
      port: 3010,
      capabilities: ["stream", "file-sharing"],
      bonjourFactory: () => ({
        find: () => ({ stop: () => undefined }),
        publish: options => {
          published = options
          return {
            stop: (callback?: () => void) => {
              stopped = true
              callback?.()
            },
          } as unknown as Service
        },
        destroy: callback => {
          destroyed = true
          callback?.()
        },
      }),
    })

    expect(published).toEqual({
      name: "Korri on aka",
      type: "korri-stream",
      protocol: "tcp",
      port: 3010,
      txt: { proto: "1", hostId: "aka", caps: "stream,file-sharing" },
    })

    await advertisement.stop()
    expect(stopped).toBe(true)
    expect(destroyed).toBe(true)
  })

  it("rejects invalid ports", () => {
    expect(() => advertiseStreamHost({ port: 0 })).toThrow("positive port")
  })
})
