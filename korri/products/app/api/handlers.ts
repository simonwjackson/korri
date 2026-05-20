import { appRpcGroup } from "./app-rpc-group"
import { handleGetHello } from "./hello/rpc-handler"
import { handleLaunchLibrary } from "./library/launch.rpc-handler"
import { handleListLibrary } from "./library/list.rpc-handler"
import { handleListSource } from "./source/list.rpc-handler"
import { handleSourceStatus } from "./source/status.rpc-handler"
import { handlePrepareStream } from "./stream/prepare.rpc-handler"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.library.list": handleListLibrary,
    "app.library.launch": handleLaunchLibrary,
    "app.source.list": handleListSource,
    "app.source.status": handleSourceStatus,
    "app.stream.prepare": handlePrepareStream,
  }),
)
