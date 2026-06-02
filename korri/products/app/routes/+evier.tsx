import { createEvierStreamControlRpcClient } from "@app/features/evier/stream-control-rpc-client"
import { EvierStreamControlPage } from "@shared/themes/evier/pages/EvierStreamControlPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/evier")({
  component: EvierRoute,
})

const evierStreamControl = createEvierStreamControlRpcClient()

function EvierRoute() {
  return <EvierStreamControlPage controller={evierStreamControl} />
}
