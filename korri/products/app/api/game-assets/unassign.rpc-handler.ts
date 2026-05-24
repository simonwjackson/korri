import { ValidationError } from "@shared/api/rpc/errors"
import { GameAssets } from "@shared/library/game-assets/game-assets-service"
import { logger } from "@shared/logger"
import { Effect } from "effect"
import { areGameAssetTrustedWritesEnabled } from "./trusted-writes"
import {
  type UnassignGameAssetPayload,
  UnassignGameAssetResponse,
} from "./unassign.rpc"
import { validateUnassignGameAssetPayload } from "./validation"

export const handleUnassignGameAsset = (
  payload: typeof UnassignGameAssetPayload.Type,
) =>
  Effect.gen(function* () {
    const validated = yield* validateUnassignGameAssetPayload(payload)
    if (!areGameAssetTrustedWritesEnabled()) {
      logger.warn(
        { gameId: validated.gameId, role: validated.role },
        "app.game-assets.unassign: trusted writes disabled",
      )
      return yield* Effect.fail(
        new ValidationError({
          message:
            "trusted game-asset writes are disabled; set KORRI_GAME_ASSETS_TRUSTED_WRITES=1 only for local/test/trusted-control deployments",
        }),
      )
    }

    logger.info(
      { gameId: validated.gameId, role: validated.role },
      "app.game-assets.unassign: removing assignment",
    )

    const gameAssetService = yield* GameAssets
    const result = yield* gameAssetService.unassign(validated)

    logger.info(
      {
        gameId: result.assignment.gameId,
        role: result.assignment.role,
        assetId: result.asset.id,
      },
      "app.game-assets.unassign: removed assignment",
    )

    return new UnassignGameAssetResponse(result)
  })
