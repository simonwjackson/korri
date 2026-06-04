/**
 * Envelope shape guard and normalizer for `/api/rpc`.
 *
 * Effect-RPC's `RpcServer` has two interacting bugs at the protocol
 * layer (both still present in effect@4.0.0-beta.71, the latest beta):
 *
 *   1. `RpcServer.js:651` runs
 *      `message.headers = requestHeaders.concat(message.headers)` for
 *      every decoded Request frame. When the client omits the
 *      `headers` field, `message.headers === undefined` and
 *      `[].concat(undefined)` returns `[undefined]` (a JavaScript
 *      `Array.prototype.concat` quirk). That `[undefined]` then
 *      reaches `Headers.fromInput()` (RpcServer.js:479) which iterates
 *      it, tries to destructure `[k, v]` from `undefined`, and throws
 *      a TypeError caught as a FATAL `RpcServer protocol crashed`
 *      defect. The whole RPC pipeline dies for the lifetime of the
 *      bun process (systemd still considers the unit "active"
 *      because the runtime stays alive — it just can't serve).
 *
 *   2. The same `Headers.fromInput()` accepts any iterable without
 *      validating the entry shape, so e.g. `headers: [null]` from a
 *      malformed client crashes the same way for the same reason.
 *
 * Federation v1 made both bugs exploitable in practice: every
 * korri-server now binds `0.0.0.0` + mDNS-advertises, so any LAN
 * client (or a normal Korri RPC client that happens to omit the
 * optional headers field) can crash the server with a one-liner.
 *
 * This guard sits in front of the Hono `/api/rpc` route and does
 * two things:
 *
 *   - Validates the wire envelope against the subset Effect actually
 *     consumes (per `RequestEncoded` in
 *     `node_modules/effect/dist/unstable/rpc/RpcMessage.d.ts`).
 *     Malformed bodies are rejected with `400` and the bad envelope
 *     is logged with body sample + remote hint so the misbehaving
 *     sender is identifiable.
 *
 *   - Normalizes valid Request frames so `headers` is always a
 *     concrete `[]` before reaching RpcServer. This sidesteps bug (1)
 *     above: with `message.headers = []`, `requestHeaders.concat([])`
 *     produces the HTTP headers list unchanged, no `[undefined]`,
 *     no crash.
 *
 * What we validate:
 *
 *   - The body parses as JSON.
 *   - JSON resolves to a single frame object OR an array of frames.
 *     `BatchJsonSerialization` (see ./serialization.ts) accepts both.
 *   - Each frame is a plain object with a string `_tag`.
 *   - For `Request` frames: `id`/`tag` are strings; `headers`, when
 *     present, is `Array<[string, string]>`. `payload` is untouched
 *     because the per-RPC schemas validate it downstream.
 *
 * What we deliberately do NOT validate:
 *
 *   - `payload` shape — per-RPC schemas handle that and emit graceful
 *     defects, not protocol crashes.
 *   - The optional Effect tracing fields (`traceId`, `spanId`,
 *     `sampled`) — they're consumed by Effect's `Schema.decode` which
 *     produces a normal defect, not a protocol crash, on bad input.
 *   - Non-Request frame shapes (Ack/Interrupt/Ping/Eof) — they don't
 *     touch the `Headers.fromInput` code path.
 */

/**
 * Minimal warn-only logger interface. Accepts pino's `Logger` shape but
 * tests can pass a stub without depending on pino's full LogFn overload
 * set.
 */
export interface EnvelopeGuardLogger {
  readonly warn: (obj: Record<string, unknown>, msg: string) => void
}

export type EnvelopeValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: string
      readonly frameIndex?: number
    }

/**
 * Validate a parsed RPC wire body. Pure function — no IO, no logging.
 */
export function validateRpcEnvelope(body: unknown): EnvelopeValidationResult {
  if (Array.isArray(body)) {
    for (let i = 0; i < body.length; i++) {
      const frameResult = validateFrame(body[i])
      if (!frameResult.ok) {
        return { ...frameResult, frameIndex: i }
      }
    }
    return { ok: true }
  }
  // Single-frame body (Effect-RPC HTTP client default).
  const frameResult = validateFrame(body)
  if (!frameResult.ok) return frameResult
  return { ok: true }
}

function validateFrame(frame: unknown): EnvelopeValidationResult {
  if (frame === null || typeof frame !== "object" || Array.isArray(frame)) {
    return { ok: false, reason: "frame is not a plain object" }
  }
  const tag = (frame as { _tag?: unknown })._tag
  if (typeof tag !== "string" || tag.length === 0) {
    return { ok: false, reason: "frame._tag missing or not a string" }
  }
  if (tag !== "Request") {
    // Ack / Interrupt / Ping / Eof do not touch Headers.fromInput.
    return { ok: true }
  }
  const req = frame as {
    readonly id?: unknown
    readonly tag?: unknown
    readonly headers?: unknown
  }
  if (typeof req.id !== "string" || req.id.length === 0) {
    return { ok: false, reason: "Request.id must be a non-empty string" }
  }
  if (typeof req.tag !== "string" || req.tag.length === 0) {
    return { ok: false, reason: "Request.tag must be a non-empty string" }
  }
  if (req.headers === undefined) return { ok: true }
  if (!Array.isArray(req.headers)) {
    return {
      ok: false,
      reason: "Request.headers must be an array when present",
    }
  }
  for (let j = 0; j < req.headers.length; j++) {
    const pair = req.headers[j]
    if (!Array.isArray(pair) || pair.length !== 2) {
      return {
        ok: false,
        reason: `Request.headers[${j}] must be a [string, string] pair`,
      }
    }
    if (typeof pair[0] !== "string" || typeof pair[1] !== "string") {
      return {
        ok: false,
        reason: `Request.headers[${j}] entries must be strings`,
      }
    }
  }
  return { ok: true }
}

export interface EnvelopeGuardOptions {
  readonly logger?: EnvelopeGuardLogger
  /** Truncate logged body to this many chars. Default 512. */
  readonly maxBodyChars?: number
}

export interface EnvelopeGuardOutcome {
  readonly response: Response | undefined
  readonly forwardableBody: string | undefined
}

/**
 * Normalize a parsed-and-validated envelope so every Request frame has
 * an explicit `headers: []`. Sidesteps the `[].concat(undefined)` bug
 * in `RpcServer.js:651`.
 *
 * Exported for test coverage; production callers should use
 * `guardRpcEnvelope`.
 */
export function normalizeRpcEnvelope(body: unknown): unknown {
  if (Array.isArray(body)) {
    return body.map(normalizeFrame)
  }
  return normalizeFrame(body)
}

function normalizeFrame(frame: unknown): unknown {
  if (
    frame === null ||
    typeof frame !== "object" ||
    Array.isArray(frame) ||
    (frame as { _tag?: unknown })._tag !== "Request"
  ) {
    return frame
  }
  const req = frame as { readonly headers?: unknown }
  if (Array.isArray(req.headers)) return frame
  return { ...frame, headers: [] }
}

/**
 * Read a `/api/rpc` Request, validate its envelope, normalize
 * Request frames, and return either:
 *
 *   - `{ response: <400>, forwardableBody: undefined }` to
 *     short-circuit to the caller when the envelope is malformed.
 *   - `{ response: undefined, forwardableBody: <text> }` for the
 *     caller to construct a fresh Request from `forwardableBody`.
 *     `forwardableBody` is the re-stringified, normalized envelope,
 *     not necessarily byte-identical to the original input. We
 *     return text rather than a Request because Web `Request` bodies
 *     are one-shot ReadableStreams.
 *
 * The function is io-aware but doesn't take a logger by default. Pass
 * `options.logger` to capture rejection diagnostics (recommended in
 * production).
 */
export async function guardRpcEnvelope(
  request: Request,
  options: EnvelopeGuardOptions = {},
): Promise<EnvelopeGuardOutcome> {
  const maxBodyChars = options.maxBodyChars ?? 512
  const text = await request.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    options.logger?.warn(
      {
        reason: "body is not valid JSON",
        bodySample: text.slice(0, maxBodyChars),
        parseError: error instanceof Error ? error.message : String(error),
        remoteHint: rpcRemoteHint(request),
      },
      "rpc envelope guard: rejecting malformed body",
    )
    return {
      response: new Response("Bad Request: body is not valid JSON", {
        status: 400,
      }),
      forwardableBody: undefined,
    }
  }
  const result = validateRpcEnvelope(parsed)
  if (!result.ok) {
    options.logger?.warn(
      {
        reason: result.reason,
        frameIndex: result.frameIndex,
        bodySample: text.slice(0, maxBodyChars),
        remoteHint: rpcRemoteHint(request),
      },
      "rpc envelope guard: rejecting malformed envelope",
    )
    return {
      response: new Response(`Bad Request: ${result.reason}`, { status: 400 }),
      forwardableBody: undefined,
    }
  }
  const normalized = normalizeRpcEnvelope(parsed)
  return { response: undefined, forwardableBody: JSON.stringify(normalized) }
}

/**
 * Best-effort remote hint for diagnostic logs. The Web `Request` does
 * not expose the peer socket address; this surfaces standard reverse-
 * proxy / hand-set headers when present and a hash of the URL host
 * otherwise, so log readers can correlate rejections to a sender
 * without leaking inner-network IPs needlessly.
 */
function rpcRemoteHint(request: Request): string {
  const headers = request.headers
  const fwd = headers.get("x-forwarded-for")
  if (fwd) return `x-forwarded-for=${fwd.split(",")[0]?.trim() ?? fwd}`
  const real = headers.get("x-real-ip")
  if (real) return `x-real-ip=${real}`
  const userAgent = headers.get("user-agent")
  if (userAgent) return `user-agent=${userAgent}`
  return "remote=<unknown>"
}
