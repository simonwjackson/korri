import { rpcProtocolHttpLayer } from "@platform/api/rpc/client-layer"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect } from "effect"
import { RpcClient } from "effect/unstable/rpc"

const rpcUrl = process.argv[2] ?? "http://bandai:3001/api/rpc"
const id = process.argv[3] ?? "super-mario-advance-3-yoshis-island"

const program = Effect.scoped(
  RpcClient.make(appRpcGroup).pipe(
    Effect.flatMap(client =>
      Effect.gen(function* () {
        const snapshot = yield* client["app.catalog.snapshot"]({
          scope: "fabric",
        })
        console.log(
          JSON.stringify(
            {
              type: "catalog.snapshot",
              count: snapshot.entries.length,
              games: snapshot.entries.map(entry => ({
                id: entry.id,
                title: entry.title ?? entry.metadata?.name,
              })),
            },
            null,
            2,
          ),
        )
        const launch = yield* client["app.library.launch"]({ id })
        console.log(JSON.stringify({ type: "launch", launch }, null, 2))
      }),
    ),
    Effect.provide(rpcProtocolHttpLayer(rpcUrl)),
  ),
)

await Effect.runPromise(program)
