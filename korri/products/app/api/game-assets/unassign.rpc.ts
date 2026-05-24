import { ApiError } from "@shared/api/rpc/errors"
import { GameAssetRecord } from "@shared/library/config/records/game-asset"
import {
  GameAssetAssignmentRecord,
  GameAssetRole,
} from "@shared/library/config/records/game-asset-assignment"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

const maxLength = (max: number) =>
  Schema.makeFilter<string>(value =>
    value.length <= max ? undefined : `must be ${max} characters or fewer`,
  )

export const UnassignGameAssetGameId = Schema.NonEmptyString.check(
  maxLength(256),
)

export class UnassignGameAssetPayload extends Schema.Class<UnassignGameAssetPayload>(
  "UnassignGameAssetPayload",
)({
  gameId: UnassignGameAssetGameId,
  role: GameAssetRole,
}) {}

export class UnassignGameAssetResponse extends Schema.Class<UnassignGameAssetResponse>(
  "UnassignGameAssetResponse",
)({
  asset: GameAssetRecord,
  assignment: GameAssetAssignmentRecord,
}) {}

export const UnassignGameAssetRpc = Rpc.make("app.game-assets.unassign", {
  payload: UnassignGameAssetPayload,
  success: UnassignGameAssetResponse,
  error: ApiError,
})
