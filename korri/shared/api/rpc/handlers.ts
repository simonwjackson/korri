import { handleGetHello } from "@app/api/hello/rpc-handler"
import { appRpcGroup } from "./app-rpc-group"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
  }),
)
