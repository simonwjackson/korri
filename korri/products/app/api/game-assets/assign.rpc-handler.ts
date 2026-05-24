import { ValidationError } from "@shared/api/rpc/errors"
import { GameAssets } from "@shared/library/game-assets/game-assets-service"
import { logger } from "@shared/logger"
import { Effect } from "effect"
import {
  type AssignGameAssetPayload,
  AssignGameAssetResponse,
} from "./assign.rpc"
import { areGameAssetTrustedWritesEnabled } from "./trusted-writes"
import { validateAssignGameAssetPayload } from "./validation"

export const handleAssignGameAsset = (
  payload: typeof AssignGameAssetPayload.Type,
) =>
  Effect.gen(function* () {
    const validated = yield* validateAssignGameAssetPayload(payload)
    if (!areGameAssetTrustedWritesEnabled()) {
      logger.warn(
        { gameId: validated.gameId, role: validated.role },
        "app.game-assets.assign: trusted writes disabled",
      )
      return yield* Effect.fail(
        new ValidationError({
          message:
            "trusted game-asset writes are disabled; set KORRI_GAME_ASSETS_TRUSTED_WRITES=1 only for local/test/trusted-control deployments",
        }),
      )
    }

    logger.info(
      {
        gameId: validated.gameId,
        role: validated.role,
        candidateId: validated.candidateId,
      },
      "app.game-assets.assign: assigning candidate",
    )

    const gameAssetService = yield* GameAssets
    const result = yield* gameAssetService.assignCandidate(validated)

    logger.info(
      {
        gameId: result.assignment.gameId,
        role: result.assignment.role,
        candidateId: validated.candidateId,
        assetId: result.asset.id,
      },
      "app.game-assets.assign: assigned candidate",
    )

    return new AssignGameAssetResponse(result)
  })
