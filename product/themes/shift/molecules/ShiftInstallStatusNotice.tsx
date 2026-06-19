import type { ProviderInstallMetadata } from "@platform/library/install-state"

export function ShiftInstallStatusNotice({
  install,
}: {
  readonly install?: ProviderInstallMetadata
}) {
  if (!install?.canRequestInstall) return null
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80">
      Remote install available for provider app {install.appId}
    </div>
  )
}
