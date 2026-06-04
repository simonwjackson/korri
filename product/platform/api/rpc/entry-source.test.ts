import { describe, expect, it } from "bun:test"
import * as os from "node:os"
import {
  EntrySource,
  type LocalIdentityEnv,
  makeLocalEntrySource,
} from "./entry-source"

describe("EntrySource schema", () => {
  it("constructs a Schema.Class instance with hostId/controlUrl/isLocal", () => {
    const source = new EntrySource({
      hostId: "aka",
      controlUrl: "http://192.168.1.117:3001",
      isLocal: false,
    })
    expect(source.hostId).toBe("aka")
    expect(source.controlUrl).toBe("http://192.168.1.117:3001")
    expect(source.isLocal).toBe(false)
  })
})

describe("makeLocalEntrySource", () => {
  it("reads KORRI_STREAM_ADVERTISE_HOST_ID for hostId", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "sobo-test",
      HOST: "127.0.0.1",
      PORT: "3001",
    }
    const source = makeLocalEntrySource(env)
    expect(source.hostId).toBe("sobo-test")
    expect(source.isLocal).toBe(true)
  })

  it("falls back to KORRI_SERVER_ID when ADVERTISE_HOST_ID is unset", () => {
    const env: LocalIdentityEnv = {
      KORRI_SERVER_ID: "fallback-id",
      HOST: "127.0.0.1",
      PORT: "3001",
    }
    expect(makeLocalEntrySource(env).hostId).toBe("fallback-id")
  })

  it("falls back to os.hostname() when both env vars are missing", () => {
    const env: LocalIdentityEnv = {
      HOST: "127.0.0.1",
      PORT: "3001",
    }
    expect(makeLocalEntrySource(env).hostId).toBe(os.hostname())
  })

  it("derives controlUrl from KORRI_PUBLIC_API_BASE_URL when set", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "aka",
      KORRI_PUBLIC_API_BASE_URL: "http://192.168.1.117:3001/",
      HOST: "127.0.0.1",
      PORT: "3001",
    }
    // Trailing slashes are stripped to keep `${controlUrl}/api/rpc` joins
    // unambiguous downstream.
    expect(makeLocalEntrySource(env).controlUrl).toBe(
      "http://192.168.1.117:3001",
    )
  })

  it("composes controlUrl from HOST/PORT when HOST is a concrete bind", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "aka",
      HOST: "192.168.1.117",
      PORT: "4000",
    }
    expect(makeLocalEntrySource(env).controlUrl).toBe(
      "http://192.168.1.117:4000",
    )
  })

  it("substitutes a routable IPv4 when HOST is the IPv4 wildcard 0.0.0.0", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "sobo",
      HOST: "0.0.0.0",
      PORT: "3001",
    }
    const source = makeLocalEntrySource(env, {
      networkInterfaces: () => ({
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
        wlan0: [
          {
            address: "192.168.1.239",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "192.168.1.239/24",
          },
        ],
      }),
    })
    expect(source.controlUrl).toBe("http://192.168.1.239:3001")
  })

  it("substitutes a routable IPv4 when HOST is the IPv6 wildcard ::", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "sobo",
      HOST: "::",
      PORT: "3001",
    }
    const source = makeLocalEntrySource(env, {
      networkInterfaces: () => ({
        eth0: [
          {
            address: "10.0.0.42",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "aa:bb:cc:dd:ee:ff",
            internal: false,
            cidr: "10.0.0.42/24",
          },
        ],
      }),
    })
    expect(source.controlUrl).toBe("http://10.0.0.42:3001")
  })

  it("falls back to 127.0.0.1 for wildcard HOST when no routable IPv4 exists", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "isolated",
      HOST: "0.0.0.0",
      PORT: "3001",
    }
    const source = makeLocalEntrySource(env, {
      networkInterfaces: () => ({
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
      }),
    })
    expect(source.controlUrl).toBe("http://127.0.0.1:3001")
  })

  it("prefers KORRI_PUBLIC_API_BASE_URL over wildcard substitution", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "aka",
      KORRI_PUBLIC_API_BASE_URL: "http://192.168.1.117:3001",
      HOST: "0.0.0.0",
      PORT: "3001",
    }
    // The explicit override wins; networkInterfaces is not consulted.
    const source = makeLocalEntrySource(env, {
      networkInterfaces: () => {
        throw new Error(
          "networkInterfaces should not be consulted when KORRI_PUBLIC_API_BASE_URL is set",
        )
      },
    })
    expect(source.controlUrl).toBe("http://192.168.1.117:3001")
  })

  it("uses 127.0.0.1:3001 defaults when HOST/PORT are absent", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "aka",
    }
    expect(makeLocalEntrySource(env).controlUrl).toBe("http://127.0.0.1:3001")
  })

  it("always tags entries as local (isLocal: true)", () => {
    const env: LocalIdentityEnv = { KORRI_STREAM_ADVERTISE_HOST_ID: "anything" }
    expect(makeLocalEntrySource(env).isLocal).toBe(true)
  })

  it("ignores whitespace-only env values", () => {
    const env: LocalIdentityEnv = {
      KORRI_STREAM_ADVERTISE_HOST_ID: "   ",
      KORRI_SERVER_ID: "real-id",
      KORRI_PUBLIC_API_BASE_URL: "   ",
      HOST: "127.0.0.1",
      PORT: "3001",
    }
    const source = makeLocalEntrySource(env)
    expect(source.hostId).toBe("real-id")
    expect(source.controlUrl).toBe("http://127.0.0.1:3001")
  })
})
