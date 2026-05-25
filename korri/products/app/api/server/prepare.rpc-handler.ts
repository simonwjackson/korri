import { DataError } from "@shared/api/rpc/errors"
import { Effect } from "effect"
import { prepareStreamLaunch } from "../stream/prepare.rpc-handler"
import {
  type ServerPrepareStreamPayload,
  ServerPrepareStreamResponse,
} from "./prepare.rpc"

export const handleServerPrepareStream = (
  payload: typeof ServerPrepareStreamPayload.Type,
) =>
  prepareStreamLaunch(payload.id, {
    userId: payload.userId,
    presetId: payload.presetId ?? undefined,
    override: payload.override,
  }).pipe(
    Effect.map(
      prepared =>
        new ServerPrepareStreamResponse({
          status: "prepared",
          gameId: prepared.gameId,
          sessionId: prepared.sessionId,
        }),
    ),
    Effect.mapError(error =>
      error instanceof DataError
        ? new DataError({
            reason: error.reason,
            message: publicDataErrorMessage(error.reason),
          })
        : error,
    ),
  )

function publicDataErrorMessage(reason: DataError["reason"]): string {
  switch (reason) {
    case "ReadFailed":
      return "Korri source data is unavailable"
    case "WriteFailed":
      return "Korri stream preparation failed"
    case "Unavailable":
      return "Korri stream preparation is unavailable"
  }
}
