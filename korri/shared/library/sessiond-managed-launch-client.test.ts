import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  probeSessiondManagedLaunchStatus,
  requestSessiondManagedLaunchStart,
  resolveSessiondManagedLaunchToken,
  terminateSessiondManagedLaunch,
} from "./sessiond-managed-launch-client"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function tempDir() {
  const path = join(
    process.cwd(),
    "out/tmp/sessiond-managed-launch-client",
    crypto.randomUUID(),
  )
  await mkdir(path, { recursive: true })
  tempDirs.push(path)
  return path
}

describe("sessiond managed-launch client", () => {
  it("resolves direct tokens before token files", async () => {
    const dir = await tempDir()
    const tokenFile = join(dir, "token")
    await writeFile(tokenFile, "file-token\n")

    await expect(
      resolveSessiondManagedLaunchToken({
        token: " direct-token ",
        tokenFile,
      }),
    ).resolves.toBe("direct-token")
  })

  it("reads tokens from files when no direct token is configured", async () => {
    const dir = await tempDir()
    const tokenFile = join(dir, "token")
    await writeFile(tokenFile, "file-token\n")

    await expect(
      resolveSessiondManagedLaunchToken({ tokenFile }),
    ).resolves.toBe("file-token")
  })

  it("probes status with bearer token header and strict decode", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await probeSessiondManagedLaunchStatus({
      url: "http://127.0.0.1:3003/",
      token: "secret",
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
      "http://127.0.0.1:3003/managed-launch/status",
    )
    expect(
      (requests[0].init?.headers as Record<string, string>)[
        "x-korri-sessiond-token"
      ],
    ).toBe("secret")
  })

  it("classifies missing url, missing token, rejected token, unavailable host, and invalid payload", async () => {
    await expect(
      probeSessiondManagedLaunchStatus({ token: "secret" }),
    ).resolves.toEqual({
      kind: "not-configured",
    })
    await expect(
      probeSessiondManagedLaunchStatus({ url: "http://127.0.0.1:3003" }),
    ).resolves.toMatchObject({ kind: "missing-token" })
    await expect(
      probeSessiondManagedLaunchStatus({
        url: "http://127.0.0.1:3003",
        token: "secret",
        fetchImpl: async () => new Response("unauthorized", { status: 401 }),
      }),
    ).resolves.toMatchObject({ kind: "token-rejected" })
    await expect(
      probeSessiondManagedLaunchStatus({
        url: "http://127.0.0.1:3003",
        token: "secret",
        fetchImpl: async () => {
          throw new Error("connection refused")
        },
      }),
    ).resolves.toMatchObject({ kind: "unavailable" })
    await expect(
      probeSessiondManagedLaunchStatus({
        url: "http://127.0.0.1:3003",
        token: "secret",
        fetchImpl: async () => Response.json({ status: "bad" }),
      }),
    ).resolves.toMatchObject({ kind: "invalid-payload" })
  })

  it("posts strict managed-launch start requests", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await requestSessiondManagedLaunchStart(
      {
        spec: { command: "/bin/game", args: ["rom"] },
        lifecycle: "session",
        wait: { command: "/bin/wait", args: [] },
      },
      {
        url: "http://127.0.0.1:3003",
        token: "secret",
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
    expect(requests[0].input).toBe("http://127.0.0.1:3003/managed-launch")
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      spec: { command: "/bin/game", args: ["rom"] },
      lifecycle: "session",
      wait: { command: "/bin/wait", args: [] },
    })
  })

  it("posts best-effort per-launch termination requests", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = []
    const result = await terminateSessiondManagedLaunch(
      { launchId: "launch-1", force: true },
      {
        url: "http://127.0.0.1:3003",
        token: "secret",
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
      "http://127.0.0.1:3003/managed-launch/terminate",
    )
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      launchId: "launch-1",
      force: true,
    })
  })
})
