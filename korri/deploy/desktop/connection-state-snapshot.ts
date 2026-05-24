/**
 * Connection-state snapshot consumed by the desktop's Hono composition.
 *
 * The bun-side connection controller (`connection.ts`) holds a
 * `SubscriptionRef<ConnectionState>` with `Date` timestamps. The Hono
 * composition reads a single accessor per request — `getConnectionState`
 * — which returns this snapshot shape: timestamps serialized as ISO
 * strings, ready for both the inline waiting-page renderer and the
 * `/__korri/desktop/connection-status` JSON endpoint.
 *
 * Keeping the wire shape (ISO strings) and the controller shape (Date
 * objects) separate means the controller stays naturally Date-typed in
 * Effect-land while the renderer / endpoint stay JSON-typed at the HTTP
 * boundary, with one conversion at the accessor seam.
 */

export interface ConnectionServerRecord {
  readonly hostId: string
  readonly controlUrl: string
}

export type ConnectionStateSnapshot =
  | {
      readonly status: "searching"
      readonly since: string
      readonly helpAfter: string
    }
  | {
      readonly status: "reconnecting"
      readonly server: ConnectionServerRecord
      readonly since: string
      readonly helpAfter: string
    }
  | {
      readonly status: "connected"
      readonly server: ConnectionServerRecord
    }
