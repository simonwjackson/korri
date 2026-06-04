import { ValidationError } from "@platform/api/rpc/errors"
import type { GameAssetRole } from "@platform/library/config/records/game-asset-assignment"
import { Effect } from "effect"

const roles = new Set<GameAssetRole>([
  "tile",
  "banner",
  "poster",
  "hero",
  "logo",
  "screenshot",
])

export interface ValidatedAssignGameAssetPayload {
  readonly gameId: string
  readonly role: GameAssetRole
  readonly candidateId: string
}

export interface ValidatedUnassignGameAssetPayload {
  readonly gameId: string
  readonly role: GameAssetRole
}

export function validateAssignGameAssetPayload(input: {
  readonly gameId: unknown
  readonly role: unknown
  readonly candidateId: unknown
}): Effect.Effect<ValidatedAssignGameAssetPayload, ValidationError> {
  return Effect.gen(function* () {
    const gameId = yield* validateGameId(input.gameId)
    const role = yield* validateRole(input.role)
    const candidateId = yield* validateCandidateId(input.candidateId)
    return { gameId, role, candidateId }
  })
}

export function validateUnassignGameAssetPayload(input: {
  readonly gameId: unknown
  readonly role: unknown
}): Effect.Effect<ValidatedUnassignGameAssetPayload, ValidationError> {
  return Effect.gen(function* () {
    const gameId = yield* validateGameId(input.gameId)
    const role = yield* validateRole(input.role)
    return { gameId, role }
  })
}

function validateGameId(
  input: unknown,
): Effect.Effect<string, ValidationError> {
  if (typeof input !== "string") {
    return validationError("gameId must be a string")
  }
  const value = input.trim()
  if (value.length === 0) return validationError("gameId is required")
  if (value.length > 256) return validationError("gameId is too long")
  if (value.includes("\0"))
    return validationError("gameId must not contain NUL")
  if (value.includes("://") || value.startsWith("file:")) {
    return validationError("gameId must not be a raw URL")
  }
  if (value.startsWith("/") || value === ".." || value.startsWith("../")) {
    return validationError("gameId must not be a raw filesystem path")
  }
  return Effect.succeed(value)
}

function validateRole(
  input: unknown,
): Effect.Effect<GameAssetRole, ValidationError> {
  if (typeof input !== "string" || !roles.has(input as GameAssetRole)) {
    return validationError("unsupported game asset role")
  }
  return Effect.succeed(input as GameAssetRole)
}

function validateCandidateId(
  input: unknown,
): Effect.Effect<string, ValidationError> {
  if (typeof input !== "string") {
    return validationError("candidateId must be a string")
  }
  const value = input.trim()
  if (value.length === 0) return validationError("candidateId is required")
  if (value.length > 80) return validationError("candidateId is too long")
  if (value.includes("://") || value.startsWith("/") || value.startsWith(".")) {
    return validationError("candidateId must be an opaque candidate id")
  }
  if (!/^candidate:[a-f0-9]{64}$/.test(value)) {
    return validationError("candidateId must be an opaque candidate id")
  }
  return Effect.succeed(value)
}

function validationError(
  message: string,
): Effect.Effect<never, ValidationError> {
  return Effect.fail(new ValidationError({ message }))
}
