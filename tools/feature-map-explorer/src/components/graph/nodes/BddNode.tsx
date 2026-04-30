import type { Node, NodeProps } from "@xyflow/react"
import { TestTube2 } from "lucide-react"
import type { GraphNodeData } from "../types"
import { NodeCard } from "./NodeCard"

type BddFlowNode = Node<GraphNodeData, "bdd">

export function BddNode({ data, selected }: NodeProps<BddFlowNode>) {
  return (
    <NodeCard
      icon={<TestTube2 size={12} aria-hidden="true" />}
      kindLabel="Scenarios"
      title={data.title}
      secondary={data.secondary}
      statusToken={data.statusToken}
      diagnosticCount={data.diagnosticCount}
      selected={Boolean(selected)}
    />
  )
}
