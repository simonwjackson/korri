import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { LaunchSpec } from "./launcher"
import {
  createSessionLauncher,
  createSessionLauncherFromEnv,
  launchViaSessiond,
} from "./session-launcher"

const spec: LaunchSpec = { command: "/bin/game", args: ["rom.smc"] }
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function tempDir() {
  const path = join(
    process.cwd(),
    "out/tmp/session-launcher",
    crypto.randomUUID(),
  )
  await mkdir(path, { recursive: true })
  tempDirs.push(path)
  return path
}

describe("session launcher", () => {
  it("posts launch specs to sessiond with a capability token", async () => {
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

  it("can read the capability from a token file", async () => {
    const dir = await tempDir()
    const tokenFile = join(dir, "token")
    await writeFile(tokenFile, "file-secret\n")
    const requests: RequestInit[] = []

    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      tokenFile,
      fetchImpl: async (_input, init) => {
        requests.push(init ?? {})
        return Response.json({ result: { status: "launched" } })
      },
    })

    expect(result).toEqual({ status: "launched" })
    expect(
      (requests[0].headers as Record<string, string>)["x-korri-sessiond-token"],
    ).toBe("file-secret")
  })

  it("fails closed when no capability is configured", async () => {
    const result = await launchViaSessiond(spec, {
      url: "http://127.0.0.1:3003",
      fetchImpl: async () => Response.json({ result: { status: "launched" } }),
    })

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(126)
      expect(result.stderrTail).toContain("missing KORRI_SESSIOND_TOKEN")
    }
  })

  it("does not fall back to shell launch when sessiond is unreachable", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
      fetchImpl: async () => {
        throw new Error("connection refused")
      },
    })

    const result = await launcher.run(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.exitCode).toBe(125)
      expect(result.stderrTail).toContain("connection refused")
    }
  })

  it("creates a launcher from env only when KORRI_SESSIOND_URL is present", () => {
    expect(createSessionLauncherFromEnv({})).toBeUndefined()
    expect(
      createSessionLauncherFromEnv({
        KORRI_SESSIOND_URL: "http://127.0.0.1:3003",
        KORRI_SESSIOND_TOKEN: "secret",
      }),
    ).toBeDefined()
  })

  it("fails closed for managed spawn because sessiond does not expose child handles yet", async () => {
    const launcher = createSessionLauncher({
      url: "http://127.0.0.1:3003",
      token: "secret",
      fetchImpl: async () => Response.json({ result: { status: "launched" } }),
    })

    const result = await launcher.spawn!(spec)

    expect(result.status).toBe("failed")
    if (result.status === "failed") {
      expect(result.result.exitCode).toBe(125)
      expect(result.result.stderrTail).toContain("managed sessiond launch unsupported")
    }
  })
})
