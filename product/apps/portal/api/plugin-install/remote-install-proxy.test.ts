import { describe, expect, it } from "bun:test"
import { ValidationError } from "@platform/api/rpc/errors"
import {
  createRemoteInstallControlSession,
  validateRemoteInstallSource,
} from "./remote-install-proxy"

const akaSource = {
  hostId: "aka",
  controlUrl: "http://192.168.1.117:3001",
  isLocal: false,
} as const

describe("remote install proxy", () => {
  it("proxies install-control unlocks to the owning source daemon", async () => {
    const calls: string[] = []
    const response = await createRemoteInstallControlSession(
      akaSource,
      "remote-install-secret",
      (async (input, init) => {
        calls.push(String(input))
        expect(init?.method).toBe("POST")
        expect(init?.body).toBe(
          JSON.stringify({ pin: "remote-install-secret" }),
        )
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie":
              "korri_install_control=v1.session; HttpOnly; SameSite=Strict",
          },
        })
      }) as typeof fetch,
    )

    expect(response.status).toBe(200)
    expect(calls).toEqual([
      "http://192.168.1.117:3001/api/install-control/session",
    ])
  })

  it("rejects local and link-local control URLs before proxying", () => {
    for (const controlUrl of [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://169.254.1.2:3001",
    ]) {
      expect(() =>
        validateRemoteInstallSource({
          hostId: "bad-source",
          controlUrl,
          isLocal: false,
        }),
      ).toThrow(ValidationError)
    }
  })
})
