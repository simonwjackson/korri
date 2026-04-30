import { Handle, Position } from "@xyflow/react"
import { CircleAlert } from "lucide-react"
import type { ReactNode } from "react"
import type { GraphNodeStatus } from "../types"
import { NODE_HEIGHT, NODE_WIDTH } from "../types"

/*
 * Internal visual shell shared by every kind-specific graph node.
 *
 * Compounds (JobNode, BriefNode, FeatureNode, BddNode) pass icon and
 * label data; this card handles handles, status dot, diagnostic badge,
 * and selection ring. No boolean prop controls which subtree renders —
 * `selected` only swaps a class.
 */
export function NodeCard({
  icon,
  kindLabel,
  title,
  secondary,
  statusToken,
  diagnosticCount,
  selected,
}: {
  icon: ReactNode
  kindLabel: string
  title: string
  secondary: string
  statusToken: GraphNodeStatus | null
  diagnosticCount: number
  selected: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-lg border bg-surface px-3 py-2 text-left ${
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-border hover:border-border-strong"
      }`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-bg"
      />

      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="flex h-4 w-4 items-center justify-center text-accent">
          {icon}
        </span>
        <span className="font-medium text-[10px] uppercase tracking-wide">
          {kindLabel}
        </span>
        {statusToken && <StatusDot token={statusToken} />}
        {diagnosticCount > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-status-warning text-[10px]">
            <CircleAlert size={10} aria-hidden="true" />
            {diagnosticCount}
          </span>
        )}
      </div>

      <div className="truncate font-semibold text-sm text-text leading-tight">
        {title}
      </div>
      <div className="truncate font-mono text-text-muted text-[11px]">
        {secondary}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-bg"
      />
    </div>
  )
}

const STATUS_BG: Record<GraphNodeStatus, string> = {
  draft: "bg-status-draft",
  planned: "bg-status-planned",
  active: "bg-status-active",
  implemented: "bg-status-implemented",
  fixme: "bg-status-fixme",
  skip: "bg-status-skip",
  warning: "bg-status-warning",
  error: "bg-status-error",
}

function StatusDot({ token }: { token: GraphNodeStatus }) {
  return (
    <span
      aria-hidden="true"
      className={`block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_BG[token]}`}
    />
  )
}
