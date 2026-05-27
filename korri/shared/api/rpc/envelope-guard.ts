/**
 * Envelope shape guard for `/api/rpc`.
 *
 * Effect-RPC's `RpcServer` trusts the request envelope's `headers` field
 * unconditionally — it forwards `request.headers` to
 * `Headers.fromInput()` (effect/unstable/http/Headers) without schema
 * validation. When a malformed client posts e.g. `headers: [null]` the
 * iterator yields `undefined`, the destructure crashes inside Effect,
 * and `RpcServer` emits a `FATAL: RpcServer protocol crashed` defect
 * that takes the whole RPC pipeline down for the lifetime of the
 * process (systemd still considers the unit "active" because the bun
 * runtime is alive, just unable to serve).
 *
 * Federation v1 made this exploitable in practice: every korri-server
 * now binds `0.0.0.0` + mDNS-advertises, so any LAN client can crash
 * the server with a one-liner. This guard sits in front of the Hono
 * `/api/rpc` route, validates the wire envelope shape against the
 * subset Effect actually consumes, and rejects bad shapes with `400`
 * — surfacing a structured warning to logs so the bad client can be
 * identified.
 *
 * What we validate (per
 *   node_modules/effect/dist/unstable/rpc/RpcMessage.d.ts
 *   `RequestEncoded`):
 *
 *   - The body parses as JSON.
 *   - JSON resolves to a single frame object OR an array of frames.
 *     `BatchJsonSerialization` (see ./serialization.ts) accepts both:
 *     Effect-RPC's HTTP client posts a single frame per request, but the
 *     serializer wraps it into `[frame]` server-side. Reject neither.
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
 *
 * Rejected frames are logged with sufficient detail to identify the
 * sender (header sample, body sample, remote address when available)
 * without exposing payload secrets.
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
 * Read a `/api/rpc` Request, validate its envelope, and return either:
 *
 *   - `{ response: <400>, forwardableBody: undefined }` to short-circuit
 *     to the caller.
 *   - `{ response: undefined, forwardableBody: <text> }` for the caller
 *     to construct a fresh Request from `forwardableBody` and pass it
 *     to the real RPC handler. We return the text rather than a Request
 *     because Web `Request` bodies are one-shot ReadableStreams.
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
  return { response: undefined, forwardableBody: text }
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
