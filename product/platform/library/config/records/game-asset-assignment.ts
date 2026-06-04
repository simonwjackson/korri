import { Schema } from "effect"

import { GameAssetId } from "./game-asset"

const STRICT = { onExcessProperty: "error" } as const

export const GameAssetRole = Schema.Literals([
  "tile",
  "banner",
  "poster",
  "hero",
  "logo",
  "screenshot",
])
export type GameAssetRole = Schema.Schema.Type<typeof GameAssetRole>

export const GameAssetAssignmentPayload = Schema.Struct({
  gameId: Schema.NonEmptyString,
  role: GameAssetRole,
  assetId: GameAssetId,
})
export type GameAssetAssignmentPayload = Schema.Schema.Type<
  typeof GameAssetAssignmentPayload
>

export const GameAssetAssignmentRecord = Schema.Struct({
  id: Schema.NonEmptyString,
  ...GameAssetAssignmentPayload.fields,
}).check(
  Schema.makeFilter(assignment => {
    const expectedId = `${assignment.gameId}:${assignment.role}`
    return assignment.id === expectedId
      ? undefined
      : {
          path: ["id"],
          issue: "assignment id must be derived from gameId and role",
        }
  }),
)
export type GameAssetAssignmentRecord = Schema.Schema.Type<
  typeof GameAssetAssignmentRecord
>

export const decodeGameAssetAssignmentPayload = (
  input: unknown,
): GameAssetAssignmentPayload =>
  Schema.decodeUnknownSync(GameAssetAssignmentPayload)(input, STRICT)

export const decodeGameAssetAssignmentRecord = (
  input: unknown,
): GameAssetAssignmentRecord =>
  Schema.decodeUnknownSync(GameAssetAssignmentRecord)(input, STRICT)
