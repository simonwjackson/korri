import { GameAssets } from "@shared/library/game-assets/game-assets-service"
import { Effect } from "effect"
import {
  GameAssetCandidateResponse,
  type ListGameAssetCandidatesPayload,
  ListGameAssetCandidatesResponse,
} from "./list-candidates.rpc"

export const handleListGameAssetCandidates = (
  payload: typeof ListGameAssetCandidatesPayload.Type,
) =>
  Effect.gen(function* () {
    const gameAssetService = yield* GameAssets
    const candidates = yield* gameAssetService.listCandidates(payload)
    return new ListGameAssetCandidatesResponse({
      candidates: candidates.map(
        candidate => new GameAssetCandidateResponse(candidate),
      ),
    })
  })
