import type { Node, NodeProps } from "@xyflow/react"
import { Briefcase } from "lucide-react"
import type { GraphNodeData } from "../types"
import { NodeCard } from "./NodeCard"

type BriefFlowNode = Node<GraphNodeData, "brief">

export function BriefNode({ data, selected }: NodeProps<BriefFlowNode>) {
  return (
    <NodeCard
      icon={<Briefcase size={12} aria-hidden="true" />}
      kindLabel="Brief"
      title={data.title}
      secondary={data.secondary}
      statusToken={data.statusToken}
      diagnosticCount={data.diagnosticCount}
      selected={Boolean(selected)}
    />
  )
}
