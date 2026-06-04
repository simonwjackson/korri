import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import { DataError, ValidationError } from "@platform/api/rpc/errors"
import {
  decodeArtifactRecord as decodePersistedArtifactRecord,
  type ArtifactRecord as PersistedArtifactRecord,
} from "@platform/library/config/records/artifact"
import type { KorriLibraryDb } from "@platform/library/proseql/library-db"
import {
  type ArtifactKind,
  type ArtifactMetadata,
  type ArtifactRecord,
  decodeArtifactMetadata,
  decodeArtifactRecord,
} from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"

import { artifactBlobPath, promoteArtifactBytes } from "./artifact-store"

export interface ArtifactImportServiceOptions {
  readonly env: Record<string, string | undefined>
  readonly repository: ArtifactRepository
}

export interface ArtifactRepository {
  readonly findArtifactById: (
    id: string,
  ) => Promise<PersistedArtifactRecord | null>
  readonly upsertArtifact: (
    record: ArtifactRecord,
  ) => Promise<PersistedArtifactRecord>
}

export type SupportedDigestAlgorithm = "sha256" | "sha1" | "md5"
export type SupportedExpectedDigestSet = Partial<
  Record<SupportedDigestAlgorithm, string>
>

export interface ArtifactImportMetadata {
  readonly kind: ArtifactKind
  readonly system?: string
  readonly format: ArtifactMetadata["format"]
  readonly file: ArtifactMetadata["file"]
  readonly expectedDigests?: SupportedExpectedDigestSet
  readonly facets?: ArtifactMetadata["facets"]
  readonly provenance?: ArtifactMetadata["provenance"]
  readonly externalIds?: ArtifactMetadata["externalIds"]
  readonly sourceData?: ArtifactMetadata["sourceData"]
}

export interface ImportBytesInput extends ArtifactImportMetadata {
  readonly bytes: Buffer | Uint8Array | string
}

export interface ImportFileInput extends ArtifactImportMetadata {
  readonly sourcePath: string
}

export interface ArtifactImportService {
  readonly importBytes: (input: ImportBytesInput) => Promise<ArtifactRecord>
  readonly importFile: (input: ImportFileInput) => Promise<ArtifactRecord>
}

export function createArtifactImportService(
  options: ArtifactImportServiceOptions,
): ArtifactImportService {
  return {
    importBytes: input => importBytes(options, input),
    importFile: async input => {
      const bytes = await readImportFile(input.sourcePath)
      return await importBytes(options, { ...input, bytes })
    },
  }
}

export function createProseqlArtifactRepository(
  db: Pick<KorriLibraryDb, "artifacts" | "flush">,
): ArtifactRepository {
  return {
    findArtifactById: async id => {
      try {
        const records = await db.artifacts.query().runPromise
        const record = records.find(record => record.id === id)
        if (!record) return null
        try {
          return decodePersistedArtifactRecord(record)
        } catch {
          return null
        }
      } catch (error) {
        throw new DataError({
          reason: "ReadFailed",
          message: `failed to read artifact catalog: ${stringifyError(error)}`,
        })
      }
    },

    upsertArtifact: async record => {
      try {
        await Effect.runPromise(
          db.artifacts.upsert({
            where: { id: record.id },
            create: persistableArtifact(record),
            update: persistableArtifact(record),
          }),
        )
        await db.flush()
        return record
      } catch (error) {
        throw new DataError({
          reason: "WriteFailed",
          message: `failed to persist artifact record: ${stringifyError(error)}`,
        })
      }
    },
  }
}

async function importBytes(
  options: ArtifactImportServiceOptions,
  input: ImportBytesInput,
): Promise<ArtifactRecord> {
  const bytes = normalizeBytes(input.bytes)
  const sha256 = digestBytes("sha256", bytes)
  const id = `sha256:${sha256}`

  const verifiedDigests = verifyExpectedDigests(bytes, input.expectedDigests)
  const existing = await options.repository.findArtifactById(id)
  if (existing) {
    const runtimeExisting = withRuntimeLocalPath(options.env, existing)
    try {
      await promoteArtifactBytes(options.env, runtimeExisting, bytes)
    } catch (error) {
      throw new DataError({
        reason: "WriteFailed",
        message: `failed to re-promote existing artifact bytes: ${stringifyError(error)}`,
      })
    }
    return runtimeExisting
  }

  const metadata = decodeArtifactMetadata(
    omitUndefined({
      kind: input.kind,
      system: input.system,
      format: input.format,
      file: input.file,
      expectedDigests: input.expectedDigests,
      facets: input.facets,
      provenance: input.provenance,
      externalIds: input.externalIds,
      sourceData: input.sourceData,
    }),
  )
  const record = decodeArtifactRecord(
    omitUndefined({
      id,
      ...metadata,
      localPath: artifactBlobPath(options.env, { id, file: metadata.file }),
      digests: verifiedDigests,
    }),
  ) as ArtifactRecord

  try {
    await promoteArtifactBytes(options.env, record, bytes)
  } catch (error) {
    throw new DataError({
      reason: "WriteFailed",
      message: `failed to promote artifact bytes: ${stringifyError(error)}`,
    })
  }
  await options.repository.upsertArtifact(record)
  return record
}

async function readImportFile(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (error) {
    throw new DataError({
      reason: "ReadFailed",
      message: `failed to read artifact import file: ${stringifyError(error)}`,
    })
  }
}

function normalizeBytes(bytes: Buffer | Uint8Array | string): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
}

function verifyExpectedDigests(
  bytes: Buffer,
  expectedDigests: SupportedExpectedDigestSet | undefined,
): Record<string, string> {
  const digests: Record<string, string> = {
    sha256: digestBytes("sha256", bytes),
  }
  for (const [algorithm, expected] of Object.entries(expectedDigests ?? {})) {
    if (!isSupportedDigestAlgorithm(algorithm)) {
      throw new ValidationError({
        message: `unsupported expected digest algorithm: ${algorithm}`,
      })
    }
    const actual = digestBytes(algorithm, bytes)
    if (actual !== expected) {
      throw new ValidationError({
        message: `expected ${algorithm} digest does not match artifact bytes`,
      })
    }
    digests[algorithm] = actual
  }
  return digests
}

function isSupportedDigestAlgorithm(
  algorithm: string,
): algorithm is SupportedDigestAlgorithm {
  return algorithm === "sha256" || algorithm === "sha1" || algorithm === "md5"
}

function digestBytes(
  algorithm: SupportedDigestAlgorithm,
  bytes: Buffer,
): string {
  switch (algorithm) {
    case "sha256":
    case "sha1":
    case "md5":
      return createHash(algorithm).update(bytes).digest("hex")
  }
}

function withRuntimeLocalPath(
  env: Record<string, string | undefined>,
  record: PersistedArtifactRecord,
): ArtifactRecord {
  return decodeArtifactRecord({
    ...record,
    localPath: artifactBlobPath(env, record),
  })
}

function persistableArtifact(record: ArtifactRecord): PersistedArtifactRecord {
  const { localPath: _localPath, ...persisted } = record
  return decodePersistedArtifactRecord(persisted)
}

function omitUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
