import { access } from "node:fs/promises"
import { Effect } from "effect"

import type { AppDescriptor } from "./app-integrations"
import { validateAppModuleCompatibility } from "./app-integrations"
import {
  ModuleNotFound,
  ModulePathMissing,
  type ResolutionError,
} from "./errors"
import type { ModuleRecord } from "./records/module"

export interface ResolvedModuleSelection {
  readonly moduleId?: string
  readonly modulePath?: string
  readonly legacyCore?: string
  readonly record?: ModuleRecord
}

export const resolveModuleSelection = (input: {
  readonly app: AppDescriptor
  readonly modules: ReadonlyMap<string, ModuleRecord>
  readonly moduleId: string | undefined
  readonly explicitLaunchModule: boolean
  readonly checkPathExists?: boolean
}): Effect.Effect<ResolvedModuleSelection, ResolutionError> =>
  Effect.gen(function* () {
    if (!input.moduleId) return {}

    const record = input.modules.get(input.moduleId)
    if (!record) {
      if (input.explicitLaunchModule) {
        return yield* Effect.fail(
          new ModuleNotFound({ moduleId: input.moduleId }),
        )
      }
      return { moduleId: input.moduleId, legacyCore: input.moduleId }
    }

    yield* validateAppModuleCompatibility({ app: input.app, module: record })

    if (input.checkPathExists) {
      const exists = yield* pathExists(record.path)
      if (!exists) {
        return yield* Effect.fail(
          new ModulePathMissing({ moduleId: record.id, path: record.path }),
        )
      }
    }

    return {
      moduleId: record.id,
      modulePath: record.path,
      record,
    }
  })

const pathExists = (path: string): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  })
