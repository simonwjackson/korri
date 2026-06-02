import { appRpcGroup } from "./app-rpc-group"
import { handleAssignGameAsset } from "./game-assets/assign.rpc-handler"
import { handleListGameAssetCandidates } from "./game-assets/list-candidates.rpc-handler"
import { handleUnassignGameAsset } from "./game-assets/unassign.rpc-handler"
import { handleGetHello } from "./hello/rpc-handler"
import { handleLaunchLibrary } from "./library/launch.rpc-handler"
import { handleListLibrary } from "./library/list.rpc-handler"
import { handleListSource } from "./source/list.rpc-handler"
import { handleSourceStatus } from "./source/status.rpc-handler"
import { handlePrepareStream } from "./stream/prepare.rpc-handler"
import {
  handleGetStreamControlConfig,
  handleGetStreamControlState,
  handleSetGamescopeFilter,
  handleSetGamescopeFps,
  handleSetGamescopeMode,
  handleSetGamescopeSharpness,
  handleSetMoonlightBitrate,
  handleSetMoonlightFps,
  handleSetMoonlightResolution,
} from "./stream-control/stream-control.rpc-handlers"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.game-assets.candidates.list": handleListGameAssetCandidates,
    "app.game-assets.assign": handleAssignGameAsset,
    "app.game-assets.unassign": handleUnassignGameAsset,
    "app.library.list": handleListLibrary,
    "app.library.launch": handleLaunchLibrary,
    "app.source.list": handleListSource,
    "app.source.status": handleSourceStatus,
    "app.stream.prepare": handlePrepareStream,
    "app.stream-control.config.get": handleGetStreamControlConfig,
    "app.stream-control.state.get": handleGetStreamControlState,
    "app.stream-control.moonlight-bitrate.set": handleSetMoonlightBitrate,
    "app.stream-control.moonlight-fps.set": handleSetMoonlightFps,
    "app.stream-control.moonlight-resolution.set": handleSetMoonlightResolution,
    "app.stream-control.gamescope-mode.set": handleSetGamescopeMode,
    "app.stream-control.gamescope-fps.set": handleSetGamescopeFps,
    "app.stream-control.gamescope-filter.set": handleSetGamescopeFilter,
    "app.stream-control.gamescope-sharpness.set": handleSetGamescopeSharpness,
  }),
)
