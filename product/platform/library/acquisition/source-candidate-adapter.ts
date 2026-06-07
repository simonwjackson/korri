import { LibraryItemRecord } from "@platform/library/config/records/library-item"
import type { SourceCandidatePlayable } from "@platform/protocol/acquisition/candidate"
import { Schema } from "effect"

export function sourceCandidatePlayableToLibraryItem(
  playable: SourceCandidatePlayable,
): LibraryItemRecord {
  return Schema.decodeUnknownSync(LibraryItemRecord)(playable)
}
