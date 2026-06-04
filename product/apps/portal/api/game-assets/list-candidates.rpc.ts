import { ApiError } from "@platform/api/rpc/errors"
import { GameAssetSource } from "@platform/library/config/records/game-asset"
import { GameAssetRole } from "@platform/library/config/records/game-asset-assignment"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

const maxLength = (max: number) =>
  Schema.makeFilter<string>(value =>
    value.length <= max ? undefined : `must be ${max} characters or fewer`,
  )

const SafeGameId = Schema.NonEmptyString.check(maxLength(256))

export class ListGameAssetCandidatesPayload extends Schema.Class<ListGameAssetCandidatesPayload>(
  "ListGameAssetCandidatesPayload",
)({
  gameId: Schema.optional(SafeGameId),
  role: Schema.optional(GameAssetRole),
}) {}

export class GameAssetCandidateResponse extends Schema.Class<GameAssetCandidateResponse>(
  "GameAssetCandidateResponse",
)({
  candidateId: Schema.String.check(
    Schema.isPattern(/^candidate:[a-f0-9]{64}$/),
    maxLength(80),
  ),
  gameId: SafeGameId,
  role: GameAssetRole,
  width: Schema.Int.check(Schema.isGreaterThan(0)),
  height: Schema.Int.check(Schema.isGreaterThan(0)),
  source: GameAssetSource,
}) {}

export class ListGameAssetCandidatesResponse extends Schema.Class<ListGameAssetCandidatesResponse>(
  "ListGameAssetCandidatesResponse",
)({
  candidates: Schema.Array(GameAssetCandidateResponse),
}) {}

export const ListGameAssetCandidatesRpc = Rpc.make(
  "app.game-assets.candidates.list",
  {
    payload: ListGameAssetCandidatesPayload,
    success: ListGameAssetCandidatesResponse,
    error: ApiError,
  },
)
