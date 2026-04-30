import type { Node, NodeProps } from "@xyflow/react"
import { ListTree } from "lucide-react"
import type { GraphNodeData } from "../types"
import { NodeCard } from "./NodeCard"

type JobFlowNode = Node<GraphNodeData, "job">

export function JobNode({ data, selected }: NodeProps<JobFlowNode>) {
  return (
    <NodeCard
      icon={<ListTree size={12} aria-hidden="true" />}
      kindLabel="Job"
      title={data.title}
      secondary={data.secondary}
      statusToken={data.statusToken}
      diagnosticCount={data.diagnosticCount}
      selected={Boolean(selected)}
    />
  )
}
