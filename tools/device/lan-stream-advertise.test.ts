import { describe, expect, it } from "bun:test"
import type { Service } from "bonjour-service"
import { advertiseStreamHost } from "./lan-stream-advertise"

describe("LAN stream advertisement", () => {
  describe("bonjour-service backend", () => {
    it("publishes a Korri stream mDNS service with versioned capabilities", async () => {
      let published: unknown
      let stopped = false
      let destroyed = false

      const advertisement = advertiseStreamHost({
        name: "Korri on aka",
        hostId: "aka",
        port: 3010,
        capabilities: ["stream", "file-sharing"],
        backend: "bonjour",
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

    it("is selected by auto-detection when avahi-daemon is not running", () => {
      let published = false
      advertiseStreamHost({
        hostId: "aka",
        port: 3001,
        detectAvahi: () => false,
        bonjourFactory: () => ({
          find: () => ({ stop: () => undefined }),
          publish: () => {
            published = true
            return {
              stop: (callback?: () => void) => callback?.(),
            } as unknown as Service
          },
          destroy: callback => callback?.(),
        }),
      })
      expect(published).toBe(true)
    })
  })

  describe("avahi backend", () => {
    it("delegates to avahi-publish-service with derived service type and txt", () => {
      let publishCall:
        | {
            name: string
            type: string
            protocol: string
            port: number
            txt: Record<string, string>
          }
        | undefined

      advertiseStreamHost({
        hostId: "aka",
        port: 3001,
        capabilities: ["stream", "source"],
        backend: "avahi",
        publishAvahi: options => {
          publishCall = {
            name: options.name,
            type: options.type,
            protocol: options.protocol,
            port: options.port,
            txt: { ...options.txt },
          }
          return { stop: async () => {} }
        },
      })

      expect(publishCall).toEqual({
        name: "Korri Stream on aka",
        type: "korri-stream",
        protocol: "tcp",
        port: 3001,
        txt: { proto: "1", hostId: "aka", caps: "stream,source" },
      })
    })

    it("is selected by auto-detection when avahi-daemon is running", () => {
      let published = false
      advertiseStreamHost({
        hostId: "aka",
        port: 3001,
        detectAvahi: () => true,
        publishAvahi: () => {
          published = true
          return { stop: async () => {} }
        },
      })
      expect(published).toBe(true)
    })

    it("stops the avahi publisher when the advertisement stops", async () => {
      let stopped = false
      const advertisement = advertiseStreamHost({
        hostId: "aka",
        port: 3001,
        backend: "avahi",
        publishAvahi: () => ({
          stop: async () => {
            stopped = true
          },
        }),
      })
      await advertisement.stop()
      expect(stopped).toBe(true)
    })
  })

  it("rejects invalid ports", () => {
    expect(() => advertiseStreamHost({ port: 0 })).toThrow("positive port")
  })
})
