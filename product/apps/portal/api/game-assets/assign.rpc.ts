import { ApiError } from "@platform/api/rpc/errors"
import { GameAssetRecord } from "@platform/library/config/records/game-asset"
import {
  GameAssetAssignmentRecord,
  GameAssetRole,
} from "@platform/library/config/records/game-asset-assignment"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

const maxLength = (max: number) =>
  Schema.makeFilter<string>(value =>
    value.length <= max ? undefined : `must be ${max} characters or fewer`,
  )

export const AssignGameAssetCandidateId = Schema.String.check(
  Schema.isPattern(/^candidate:[a-f0-9]{64}$/),
  maxLength(80),
)

export const AssignGameAssetGameId = Schema.NonEmptyString.check(maxLength(256))

export class AssignGameAssetPayload extends Schema.Class<AssignGameAssetPayload>(
  "AssignGameAssetPayload",
)({
  gameId: AssignGameAssetGameId,
  role: GameAssetRole,
  candidateId: AssignGameAssetCandidateId,
}) {}

export class AssignGameAssetResponse extends Schema.Class<AssignGameAssetResponse>(
  "AssignGameAssetResponse",
)({
  asset: GameAssetRecord,
  assignment: GameAssetAssignmentRecord,
}) {}

export const AssignGameAssetRpc = Rpc.make("app.game-assets.assign", {
  payload: AssignGameAssetPayload,
  success: AssignGameAssetResponse,
  error: ApiError,
})
