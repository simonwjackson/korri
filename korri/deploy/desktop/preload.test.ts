import { describe, expect, it } from "bun:test"
import { chainAcceptor } from "./preload"

interface WindowDouble {
  __electrobun?: {
    receiveMessageFromBun?: (msg: unknown) => void
    [k: string]: unknown
  }
}

function makeWindow(): WindowDouble {
  return {}
}

/**
 * `chainAcceptor` is the load-bearing primitive shared by every
 * preload installer (today just `installDesktopInputBridge`) and by
 * any future bridge added to the preload. Its isolation property — a
 * throwing acceptor doesn't poison the chain for the next acceptor —
 * was previously regression-tested via the cross-bridge composition in
 * `preload-runtime-bridge.test.ts`. With that file gone (U6), the same
 * coverage migrates here using synthetic acceptors.
 */
describe("chainAcceptor", () => {
  it("creates __electrobun when missing", () => {
    const w = makeWindow()
    chainAcceptor(w as unknown as Window & typeof globalThis, () => {})

    expect(typeof w.__electrobun?.receiveMessageFromBun).toBe("function")
  })

  it("delivers every message to every chained acceptor in order", () => {
    const w = makeWindow()
    const received: Array<{ owner: string; value: unknown }> = []

    chainAcceptor(w as unknown as Window & typeof globalThis, v =>
      received.push({ owner: "first", value: v }),
    )
    chainAcceptor(w as unknown as Window & typeof globalThis, v =>
      received.push({ owner: "second", value: v }),
    )

    w.__electrobun?.receiveMessageFromBun?.({ kind: "hello" })

    expect(received).toEqual([
      { owner: "first", value: { kind: "hello" } },
      { owner: "second", value: { kind: "hello" } },
    ])
  })

  it("a throwing acceptor does not poison the chain for the next acceptor", () => {
    const w = makeWindow()
    chainAcceptor(w as unknown as Window & typeof globalThis, () => {
      throw new Error("first acceptor blew up")
    })

    const survivors: unknown[] = []
    chainAcceptor(w as unknown as Window & typeof globalThis, v =>
      survivors.push(v),
    )

    // First call: the throwing acceptor runs and (caught), then the
    // surviving acceptor runs.
    expect(() =>
      w.__electrobun?.receiveMessageFromBun?.({ kind: "one" }),
    ).not.toThrow()

    // Second call: same — the chain isn't permanently broken.
    expect(() =>
      w.__electrobun?.receiveMessageFromBun?.({ kind: "two" }),
    ).not.toThrow()

    expect(survivors).toEqual([{ kind: "one" }, { kind: "two" }])
  })

  it("preserves any previously-installed acceptor that isn't from chainAcceptor", () => {
    const externalReceived: unknown[] = []
    const w: WindowDouble = {
      __electrobun: {
        receiveMessageFromBun: msg => externalReceived.push(msg),
      },
    }

    const ourReceived: unknown[] = []
    chainAcceptor(w as unknown as Window & typeof globalThis, v =>
      ourReceived.push(v),
    )

    w.__electrobun?.receiveMessageFromBun?.({ kind: "shared" })

    expect(externalReceived).toEqual([{ kind: "shared" }])
    expect(ourReceived).toEqual([{ kind: "shared" }])
  })

  it("preserves other keys on the existing __electrobun object", () => {
    const w: WindowDouble = {
      __electrobun: {
        receiveInternalMessageFromBun: () => {},
      },
    }
    chainAcceptor(w as unknown as Window & typeof globalThis, () => {})

    expect(typeof w.__electrobun?.receiveInternalMessageFromBun).toBe(
      "function",
    )
    expect(typeof w.__electrobun?.receiveMessageFromBun).toBe("function")
  })
})
