import { Schema } from "effect"

export class EntrySource extends Schema.Class<EntrySource>("EntrySource")({
  hostId: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
}) {}
