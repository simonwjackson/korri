import { describe, expect, it } from "bun:test"
import {
  AvahiCliNotFoundError,
  isAvahiDaemonRunning,
  publishViaAvahi,
  type AvahiSubprocess,
} from "./avahi-publisher"

describe("publishViaAvahi", () => {
  it("spawns avahi-publish-service with the resolved service type and txt args", () => {
    let spawnedArgv: readonly string[] | undefined
    const childDouble: AvahiSubprocess = {
      exited: Promise.resolve(0),
      kill: () => {},
    }

    publishViaAvahi({
      name: "Korri Stream on aka",
      type: "korri-stream",
      protocol: "tcp",
      port: 3001,
      txt: { proto: "1", hostId: "aka", caps: "stream,source" },
      spawn: argv => {
        spawnedArgv = argv
        return childDouble
      },
    })

    expect(spawnedArgv).toEqual([
      "avahi-publish-service",
      "Korri Stream on aka",
      "_korri-stream._tcp",
      "3001",
      "proto=1",
      "hostId=aka",
      "caps=stream,source",
    ])
  })

  it("respects a custom cli override", () => {
    let spawnedArgv: readonly string[] | undefined
    publishViaAvahi({
      name: "Test",
      type: "korri-stream",
      protocol: "tcp",
      port: 1234,
      txt: {},
      cli: "/nix/store/foo/bin/avahi-publish-service",
      spawn: argv => {
        spawnedArgv = argv
        return { exited: Promise.resolve(0), kill: () => {} }
      },
    })
    expect(spawnedArgv?.[0]).toBe("/nix/store/foo/bin/avahi-publish-service")
  })

  it("rejects invalid ports", () => {
    expect(() =>
      publishViaAvahi({
        name: "x",
        type: "y",
        protocol: "tcp",
        port: 0,
        txt: {},
        spawn: () => ({ exited: Promise.resolve(0), kill: () => {} }),
      }),
    ).toThrow("positive port")
  })

  it("kills the child on stop and tolerates a kill failure", async () => {
    let killed = false
    let exitResolve!: (code: number) => void
    const exited = new Promise<number>(resolve => {
      exitResolve = resolve
    })
    const advertisement = publishViaAvahi({
      name: "x",
      type: "korri-stream",
      protocol: "tcp",
      port: 3001,
      txt: {},
      spawn: () => ({
        exited,
        kill: () => {
          killed = true
          exitResolve(0)
        },
      }),
    })

    await advertisement.stop()
    expect(killed).toBe(true)
  })

  it("throws AvahiCliNotFoundError when the CLI is missing on $PATH", () => {
    // Force the real spawn path by not passing options.spawn, and point
    // the cli at something nonexistent. Bun.which returns null — we
    // never reach Bun.spawn.
    expect(() =>
      publishViaAvahi({
        name: "x",
        type: "korri-stream",
        protocol: "tcp",
        port: 3001,
        txt: {},
        cli: "/nonexistent/path/to/avahi-publish-service-does-not-exist",
      }),
    ).toThrow(AvahiCliNotFoundError)
  })

  it("does not hang stop() when the child never exits", async () => {
    const neverExits = new Promise<number>(() => {})
    const advertisement = publishViaAvahi({
      name: "x",
      type: "korri-stream",
      protocol: "tcp",
      port: 3001,
      txt: {},
      spawn: () => ({
        exited: neverExits,
        kill: () => {},
      }),
    })

    const start = Date.now()
    await advertisement.stop()
    expect(Date.now() - start).toBeLessThan(1500)
  })
})

describe("isAvahiDaemonRunning", () => {
  it("returns true when any candidate socket exists", () => {
    const exists = (p: string) => p === "/var/run/avahi-daemon/socket"
    expect(
      isAvahiDaemonRunning(
        ["/run/avahi-daemon/socket", "/var/run/avahi-daemon/socket"],
        exists,
      ),
    ).toBe(true)
  })

  it("returns false when no sockets exist", () => {
    expect(
      isAvahiDaemonRunning(
        ["/run/avahi-daemon/socket", "/var/run/avahi-daemon/socket"],
        () => false,
      ),
    ).toBe(false)
  })
})
