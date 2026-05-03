import { handleGetHello } from "@app/api/hello/rpc-handler"
import { handleLaunchLibrary } from "@app/api/library/launch.rpc-handler"
import { handleListLibrary } from "@app/api/library/list.rpc-handler"
import { appRpcGroup } from "./app-rpc-group"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.library.list": handleListLibrary,
    "app.library.launch": handleLaunchLibrary,
  }),
)
