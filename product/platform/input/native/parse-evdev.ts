const INPUT_EVENT_BYTE_LENGTH = 24
const TIMEVAL_SECONDS_OFFSET = 0
const TIMEVAL_MICROSECONDS_OFFSET = 8
const TYPE_OFFSET = 16
const CODE_OFFSET = 18
const VALUE_OFFSET = 20

export interface EvdevEvent {
  readonly tvSec: number
  readonly tvUsec: number
  readonly type: number
  readonly code: number
  readonly value: number
}

export interface ParseEvdevBytesResult {
  readonly events: readonly EvdevEvent[]
  readonly remainder: Uint8Array<ArrayBufferLike>
}

export function parseEvdevBytes(
  bytes: Uint8Array<ArrayBufferLike>,
): ParseEvdevBytesResult {
  const eventCount = Math.floor(bytes.byteLength / INPUT_EVENT_BYTE_LENGTH)
  const events: EvdevEvent[] = []

  if (eventCount > 0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    for (let index = 0; index < eventCount; index++) {
      const offset = index * INPUT_EVENT_BYTE_LENGTH

      events.push({
        tvSec: Number(view.getBigInt64(offset + TIMEVAL_SECONDS_OFFSET, true)),
        tvUsec: Number(
          view.getBigInt64(offset + TIMEVAL_MICROSECONDS_OFFSET, true),
        ),
        type: view.getUint16(offset + TYPE_OFFSET, true),
        code: view.getUint16(offset + CODE_OFFSET, true),
        value: view.getInt32(offset + VALUE_OFFSET, true),
      })
    }
  }

  const remainderOffset = eventCount * INPUT_EVENT_BYTE_LENGTH

  return {
    events,
    remainder: bytes.slice(remainderOffset),
  }
}
