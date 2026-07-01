import { describe, expect, it } from "bun:test"
import {
  probeSessiondManagedLaunchStatus,
  requestSessiondManagedLaunchStart,
  terminateSessiondManagedLaunch,
  toggleSessiondHomeLane,
} from "./sessiond-managed-launch-client"

describe("sessiond managed-launch client", () => {
  it("probes status over a Unix socket with strict decode", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await probeSessiondManagedLaunchStatus({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({
          schemaVersion: 1,
          mode: "idle",
          capabilities: {
            managedLaunch: true,
            lifecycleEvents: true,
            perLaunchTermination: true,
            sessionLifecycle: true,
          },
          restoreAttempts: 0,
        })
      },
    })

    expect(result).toMatchObject({ kind: "ok", status: { mode: "idle" } })
    expect(requests[0].input).toBe(
      "http://korri-sessiond/managed-launch/status",
    )
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
  })

  it("classifies missing socket, unavailable host, rejected responses, and invalid payload", async () => {
    await expect(probeSessiondManagedLaunchStatus({})).resolves.toEqual({
      kind: "not-configured",
    })
    await expect(
      probeSessiondManagedLaunchStatus({
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async () => {
          throw new Error("connection refused")
        },
      }),
    ).resolves.toMatchObject({ kind: "unavailable" })
    await expect(
      probeSessiondManagedLaunchStatus({
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async () => Response.json({ status: "bad" }),
      }),
    ).resolves.toMatchObject({ kind: "invalid-payload" })
  })

  it("posts strict managed-launch start requests", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await requestSessiondManagedLaunchStart(
      {
        spec: { command: "/bin/game", args: ["rom"] },
        launchId: "launch-1",
        lifecycle: "session",
        launchMetadata: { appProviderId: "@korri:steam" },
        launchCompanions: {
          "@fixture:companion": { enable: true, mode: "wrapped" },
        },
        wait: { command: "/bin/wait", args: [] },
      },
      {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async (input, init) => {
          requests.push({ input, init })
          return Response.json({ status: "accepted", launchId: "launch-1" })
        },
      },
    )

    expect(result).toEqual({
      kind: "ok",
      response: { status: "accepted", launchId: "launch-1" },
    })
    expect(requests[0].input).toBe("http://korri-sessiond/managed-launch")
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      spec: { command: "/bin/game", args: ["rom"] },
      launchId: "launch-1",
      lifecycle: "session",
      launchMetadata: { appProviderId: "@korri:steam" },
      launchCompanions: {
        "@fixture:companion": { enable: true, mode: "wrapped" },
      },
      wait: { command: "/bin/wait", args: [] },
    })
  })

  it("posts Home lane toggle requests", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await toggleSessiondHomeLane({
      socketPath: "/run/user/1000/korri/sessiond.sock",
      fetchImpl: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ status: "focused-hub" })
      },
    })

    expect(result).toEqual({
      kind: "ok",
      response: { status: "focused-hub" },
    })
    expect(requests[0].input).toBe(
      "http://korri-sessiond/managed-launch/home-toggle",
    )
    expect(requests[0].init?.method).toBe("POST")
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
  })

  it("posts best-effort per-launch termination requests", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await terminateSessiondManagedLaunch(
      { launchId: "launch-1", force: true },
      {
        socketPath: "/run/user/1000/korri/sessiond.sock",
        fetchImpl: async (input, init) => {
          requests.push({ input, init })
          return Response.json({ status: "accepted", launchId: "launch-1" })
        },
      },
    )

    expect(result).toEqual({
      kind: "ok",
      response: { status: "accepted", launchId: "launch-1" },
    })
    expect(requests[0].input).toBe(
      "http://korri-sessiond/managed-launch/terminate",
    )
    expect((requests[0].init as RequestInit & { unix?: string }).unix).toBe(
      "/run/user/1000/korri/sessiond.sock",
    )
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      launchId: "launch-1",
      force: true,
    })
  })
})
