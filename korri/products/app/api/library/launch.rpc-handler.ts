import { NotFoundError } from "@shared/api/rpc/errors"
import { getLibraryContext } from "@shared/library/library-context"
import { logger } from "@shared/logger/logger"
import { Effect } from "effect"

import type { LaunchLibraryPayload, LaunchLibraryResponse } from "./launch.rpc"

export const handleLaunchLibrary = (payload: typeof LaunchLibraryPayload.Type) =>
  Effect.gen(function* () {
    const ctx = getLibraryContext()
    const spec = yield* Effect.promise(() => ctx.source.launchSpecFor(payload.id))

    if (!spec) {
      logger.warn(
        { id: payload.id },
        "app.library.launch: unknown id; nothing to spawn",
      )
      return yield* Effect.fail(
        new NotFoundError({ message: `Unknown game id: ${payload.id}` }),
      )
    }

    const result = yield* Effect.promise(() => ctx.launcher.run(spec))

    if (result.status === "launched") {
      logger.info(
        { id: payload.id, command: spec.command, exitCode: 0 },
        "app.library.launch: launched",
      )
      return { status: "launched" } satisfies LaunchLibraryResponse
    }

    logger.warn(
      { id: payload.id, command: spec.command, exitCode: result.exitCode },
      "app.library.launch: failed",
    )
    return result.stderrTail !== undefined
      ? ({
          status: "failed",
          exitCode: result.exitCode,
          stderrTail: result.stderrTail,
        } satisfies LaunchLibraryResponse)
      : ({
          status: "failed",
          exitCode: result.exitCode,
        } satisfies LaunchLibraryResponse)
  })
