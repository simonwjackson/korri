/**
 * Shared response envelope types for RPC endpoints.
 *
 * These provide reusable `meta` struct definitions so each rpc.ts
 * doesn't need to redefine `{ timestamp: Schema.String }` inline.
 *
 * Usage:
 * ```ts
 * import { TimestampMeta } from "@platform/api/rpc/response"
 *
 * export class MyResponse extends Schema.Class<MyResponse>("MyResponse")({
 *   data: Schema.Array(MyItem),
 *   meta: TimestampMeta,
 * }) {}
 * ```
 */

import { Schema } from "effect"

/**
 * Basic meta with just a timestamp.
 * The most common envelope shape — used by ~16 endpoints.
 */
export const TimestampMeta = Schema.Struct({
  timestamp: Schema.String,
})

/**
 * Meta with timestamp and item count.
 * Used by list endpoints that include a row count.
 */
export const CountMeta = Schema.Struct({
  timestamp: Schema.String,
  count: Schema.Int,
})

/**
 * Meta with timestamp and total count.
 * Used by list endpoints with pagination-style totals.
 */
export const TotalCountMeta = Schema.Struct({
  timestamp: Schema.String,
  totalCount: Schema.Int,
})
