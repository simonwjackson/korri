import { describe, expect, it } from "bun:test"
import { validateOutboundHttpUrl, validateRedirectUrl } from "./url-policy"

describe("acquisition outbound URL policy", () => {
  it("accepts public http and https URLs", () => {
    expect(validateOutboundHttpUrl("https://example.com/game").hostname).toBe(
      "example.com",
    )
    expect(validateOutboundHttpUrl("http://example.com/game").protocol).toBe(
      "http:",
    )
  })

  it("rejects non-http schemes, embedded credentials, and private targets", () => {
    for (const url of [
      "file:///tmp/game.zip",
      "https://user:pass@example.com/game.zip",
      "http://localhost/game.zip",
      "http://127.0.0.1/game.zip",
      "http://0.0.0.0/game.zip",
      "http://0.1.2.3/game.zip",
      "http://10.0.0.1/game.zip",
      "http://100.64.0.1/game.zip",
      "http://172.16.0.1/game.zip",
      "http://192.168.1.1/game.zip",
      "http://169.254.1.1/game.zip",
      "http://[::1]/game.zip",
      "http://[::]/game.zip",
      "http://[fe80::1]/game.zip",
      "http://[fe90::1]/game.zip",
      "http://[febf::1]/game.zip",
      "http://[fc00::1]/game.zip",
      "http://[fd12:3456::1]/game.zip",
      "http://[64:ff9b::127.0.0.1]/game.zip",
      "http://[::ffff:127.0.0.1]/game.zip",
      "http://[::ffff:10.0.0.1]/game.zip",
    ]) {
      expect(() => validateOutboundHttpUrl(url)).toThrow()
    }
  })

  it("revalidates redirects and rejects https scheme downgrade", () => {
    expect(() =>
      validateRedirectUrl(
        "https://example.com/start",
        "http://example.com/next",
      ),
    ).toThrow()
    expect(() =>
      validateRedirectUrl(
        "https://example.com/start",
        "https://127.0.0.1/next",
      ),
    ).toThrow()
    expect(
      validateRedirectUrl(
        "https://example.com/start",
        "https://cdn.example.com/next",
      ).hostname,
    ).toBe("cdn.example.com")
  })
})
