/**
 * RPC sidecar for `scripts/device/smoke.sh`.
 *
 * Speaks the @effect/rpc batch-JSON wire format directly (a single-element
 * array of `RequestEncoded` envelopes; response is an array including an
 * `Exit` envelope with `Schema.ExitEncoded`). Going through `runRpc()`
 * isn't viable here because that client prepends a relative `/api/rpc`
 * path that only resolves correctly inside a browser context.
 *
 * Exits 0 on success, non-zero with a clear log line on any failure.
 */

import { ListLibraryResponse } from "@app/api/library/list.rpc"
import { logger } from "@shared/logger"
import { Schema } from "effect"

const base = process.env.LOCAL_BASE
if (!base) {
  logger.error("LOCAL_BASE env var is required (e.g. http://sm8550:3001)")
  process.exit(2)
}

type RequestEnvelope = {
  readonly _tag: "Request"
  readonly id: string
  readonly tag: string
  readonly payload: unknown
  readonly headers: ReadonlyArray<[string, string]>
}

const request: RequestEnvelope = {
  _tag: "Request",
  id: "1",
  tag: "app.library.list",
  payload: {},
  headers: [],
}

const url = `${base.replace(/\/$/, "")}/api/rpc`
let response: Response
try {
  response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([request]),
  })
} catch (error) {
  logger.error({ err: error, url }, "POST /api/rpc failed")
  process.exit(1)
}

if (!response.ok) {
  const text = await response.text().catch(() => "<unreadable>")
  logger.error({ status: response.status, body: text }, "RPC HTTP non-2xx")
  process.exit(1)
}

const decoded = (await response.json()) as ReadonlyArray<{
  readonly _tag: string
  readonly requestId?: string
  readonly exit?: { readonly _tag: string; readonly value?: unknown }
  readonly defect?: unknown
}>

const exitEnvelope = decoded.find(envelope => envelope._tag === "Exit")
if (!exitEnvelope?.exit) {
  logger.error({ decoded }, "RPC response missing Exit envelope")
  process.exit(1)
}

if (exitEnvelope.exit._tag !== "Success") {
  logger.error({ exit: exitEnvelope.exit }, "RPC returned non-Success exit")
  process.exit(1)
}

let value: ListLibraryResponse
try {
  value = Schema.decodeUnknownSync(ListLibraryResponse)(exitEnvelope.exit.value)
} catch (error) {
  logger.error(
    { err: error, value: exitEnvelope.exit.value },
    "RPC response did not decode to ListLibraryResponse",
  )
  process.exit(1)
}

const games = value.games
if (games.length === 0) {
  logger.error(
    {
      hint: "Verify KORRI_ROCKNIX_GAMELIST_ROOTS in /storage/.guest/korri/app/.env points at directories with gamelist.xml files.",
    },
    "app.library.list returned 0 games",
  )
  process.exit(1)
}

logger.info(
  { count: games.length, sampleId: games[0]?.id },
  "  app.library.list ok",
)
