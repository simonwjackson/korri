import type { ProviderInstallMetadata } from "@platform/library/install-state"

export function ShiftInstallStatusNotice({
  install,
}: {
  readonly install?: ProviderInstallMetadata
}) {
  if (!install?.canRequestInstall) return null
  return (
    <div className="rounded-[var(--shift-radius-panel)] border border-[color:var(--shift-rule)] bg-[color:var(--shift-surface-raised)] px-[var(--shift-space-2)] py-[var(--shift-space-1)] text-[length:var(--shift-text-fine)] text-[color:var(--shift-ink-dim)]">
      Remote install available for provider app {install.appId}
    </div>
  )
}
