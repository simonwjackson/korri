import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "Turnip policy values must be non-empty",
    }),
  ),
)

export const TurnipPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  icdPath: Schema.optional(NonEmptyString),
  driverFiles: Schema.optional(NonEmptyString),
  glDriversPath: Schema.optional(NonEmptyString),
  eglVendorLibraryDirs: Schema.optional(NonEmptyString),
  ldLibraryPath: Schema.optional(NonEmptyString),
})
export type TurnipPolicy = Schema.Schema.Type<typeof TurnipPolicy>

export const DEFAULT_TURNIP_POLICY: TurnipPolicy = {
  enable: true,
  icdPath: "/run/opengl-driver/share/vulkan/icd.d/freedreno_icd.aarch64.json",
  glDriversPath: "/run/opengl-driver/lib/dri",
  eglVendorLibraryDirs: "/run/opengl-driver/share/glvnd/egl_vendor.d",
  ldLibraryPath: "/run/opengl-driver/lib",
}

export function decodeTurnipPolicy(input: unknown): TurnipPolicy {
  return Schema.decodeUnknownSync(TurnipPolicy)(input, STRICT)
}

export function normalizeTurnipPolicy(input: TurnipPolicy): TurnipPolicy {
  return {
    ...DEFAULT_TURNIP_POLICY,
    ...input,
    driverFiles: input.driverFiles ?? input.icdPath ?? DEFAULT_TURNIP_POLICY.icdPath,
  }
}
