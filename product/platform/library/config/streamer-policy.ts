import { Schema } from "effect"

/**
 * The platform carries a streamer's launch/control policy opaquely — it does not
 * know or type any specific streamer's schema (that lives in the streamer plugin
 * and is validated at the `stream.launch` boundary). This keeps the streamer
 * plugin removable: the config field is inert passthrough data with no plugin
 * dependency. Cascade folding merges it generically (see cascade-resolver).
 */
export const StreamerPolicy = Schema.Record(Schema.String, Schema.Unknown)
export type StreamerPolicy = Readonly<Record<string, unknown>>
