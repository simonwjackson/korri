import { Atom } from "@effect/atom-react"
import type { PluginInstallState } from "@platform/library/install-state"

export type InstallActionState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Requesting"; readonly appId: string }
  | { readonly _tag: "Status"; readonly appId: string; readonly state: PluginInstallState; readonly percent?: number }
  | { readonly _tag: "Failed"; readonly appId: string; readonly message: string }

export const installActionStateAtom = Atom.make<InstallActionState>({ _tag: "Idle" })
