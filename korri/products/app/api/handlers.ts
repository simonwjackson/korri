import { appRpcGroup } from "./app-rpc-group"
import { handleGetHello } from "./hello/rpc-handler"
import { handleLaunchLibrary } from "./library/launch.rpc-handler"
import { handleListLibrary } from "./library/list.rpc-handler"
import { handlePrepareStream } from "./stream/prepare.rpc-handler"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.library.list": handleListLibrary,
    "app.library.launch": handleLaunchLibrary,
    "app.stream.prepare": handlePrepareStream,
  }),
)
