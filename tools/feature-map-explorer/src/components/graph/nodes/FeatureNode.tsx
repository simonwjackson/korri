import type { Node, NodeProps } from "@xyflow/react"
import { FileText } from "lucide-react"
import type { GraphNodeData } from "../types"
import { NodeCard } from "./NodeCard"

type FeatureFlowNode = Node<GraphNodeData, "feature">

export function FeatureNode({ data, selected }: NodeProps<FeatureFlowNode>) {
  return (
    <NodeCard
      icon={<FileText size={12} aria-hidden="true" />}
      kindLabel="Feature"
      title={data.title}
      secondary={data.secondary}
      statusToken={data.statusToken}
      diagnosticCount={data.diagnosticCount}
      selected={Boolean(selected)}
    />
  )
}
