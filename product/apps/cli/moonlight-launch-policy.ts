import type { LibrarySourceService } from "@platform/library/library-services"
import { Cause, Effect, Exit } from "effect"
import type { MoonlightLaunchOptions } from "./moonlight-launcher"

export type CliMoonlightLaunchPolicyResult =
  | {
      readonly status: "ok"
      readonly options: Pick<
        MoonlightLaunchOptions,
        "launchCompanions" | "moonlight"
      >
    }
  | { readonly status: "failed"; readonly message: string }

export async function resolveCliMoonlightLaunchPolicy(
  librarySource: LibrarySourceService | undefined,
): Promise<CliMoonlightLaunchPolicyResult> {
  if (!librarySource) return { status: "ok", options: {} }
  if (!librarySource.resolveLocalLauncherPolicy) {
    return {
      status: "failed",
      message:
        "LibrarySource does not support local launcher policy resolution for Moonlight CLI launches",
    }
  }

  const exit = await Effect.runPromiseExit(
    librarySource.resolveLocalLauncherPolicy("moonlight", {}),
  )
  if (Exit.isFailure(exit)) {
    return { status: "failed", message: errorMessage(Cause.squash(exit.cause)) }
  }

  return {
    status: "ok",
    options: {
      launchCompanions: exit.value.launchCompanions,
      ...(exit.value.moonlight ? { moonlight: exit.value.moonlight } : {}),
    },
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error)
}
