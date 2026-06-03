import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { parseEvdevBytes } from "./parse-evdev"

const pressA = readFixture("xbox-press-a.bin")
const dpadRight = readFixture("xbox-dpad-right.bin")
const axes = readFixture("xbox-axes.bin")

function readFixture(name: string): Uint8Array {
  return readFileSync(`tools/testing/fixtures/evdev/${name}`)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const bytes = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }

  return bytes
}

describe("parseEvdevBytes", () => {
  it("decodes a single evdev input_event", () => {
    const result = parseEvdevBytes(pressA)

    expect(result).toEqual({
      events: [
        {
          tvSec: 1710000000,
          tvUsec: 123456,
          type: 1,
          code: 304,
          value: 1,
        },
      ],
      remainder: new Uint8Array(),
    })
  })

  it("decodes sequential events in order", () => {
    const result = parseEvdevBytes(dpadRight)

    expect(result.events).toEqual([
      { tvSec: 1710000001, tvUsec: 0, type: 1, code: 547, value: 1 },
      { tvSec: 1710000001, tvUsec: 20000, type: 0, code: 0, value: 0 },
      { tvSec: 1710000001, tvUsec: 40000, type: 1, code: 547, value: 0 },
      { tvSec: 1710000001, tvUsec: 60000, type: 0, code: 0, value: 0 },
      { tvSec: 1710000001, tvUsec: 80000, type: 1, code: 547, value: 1 },
    ])
    expect(result.remainder).toEqual(new Uint8Array())
  })

  it("returns no events and no remainder for empty input", () => {
    expect(parseEvdevBytes(new Uint8Array())).toEqual({
      events: [],
      remainder: new Uint8Array(),
    })
  })

  it("returns one event and trailing partial bytes for incomplete buffers", () => {
    const partial = new Uint8Array([1, 2, 3, 4, 5, 6])
    const bytes = concatBytes(pressA, partial)

    const result = parseEvdevBytes(bytes)

    expect(result.events).toEqual([
      {
        tvSec: 1710000000,
        tvUsec: 123456,
        type: 1,
        code: 304,
        value: 1,
      },
    ])
    expect(result.remainder).toEqual(partial)
  })

  it("returns only remainder when no full event is available", () => {
    const partial = pressA.slice(0, 12)

    const result = parseEvdevBytes(partial)

    expect(result).toEqual({ events: [], remainder: partial })
  })

  it("decodes signed axis values", () => {
    const result = parseEvdevBytes(axes)

    expect(result.events[0]).toEqual({
      tvSec: 1710000002,
      tvUsec: 0,
      type: 3,
      code: 0,
      value: -2048,
    })
  })

  it("supports parsing across streaming chunk boundaries", () => {
    const firstChunk = dpadRight.slice(0, 30)
    const secondChunk = dpadRight.slice(30)

    const firstResult = parseEvdevBytes(firstChunk)
    const secondResult = parseEvdevBytes(
      concatBytes(firstResult.remainder, secondChunk),
    )

    expect(firstResult.events).toEqual([
      { tvSec: 1710000001, tvUsec: 0, type: 1, code: 547, value: 1 },
    ])
    expect(firstResult.remainder).toEqual(dpadRight.slice(24, 30))
    expect(secondResult.events).toEqual([
      { tvSec: 1710000001, tvUsec: 20000, type: 0, code: 0, value: 0 },
      { tvSec: 1710000001, tvUsec: 40000, type: 1, code: 547, value: 0 },
      { tvSec: 1710000001, tvUsec: 60000, type: 0, code: 0, value: 0 },
      { tvSec: 1710000001, tvUsec: 80000, type: 1, code: 547, value: 1 },
    ])
    expect(secondResult.remainder).toEqual(new Uint8Array())
  })
})
