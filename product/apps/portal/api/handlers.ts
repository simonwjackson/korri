import { appRpcGroup } from "./app-rpc-group"
import { handleCatalogSnapshot } from "./catalog/snapshot.rpc-handler"
import { handleAssignGameAsset } from "./game-assets/assign.rpc-handler"
import { handleListGameAssetCandidates } from "./game-assets/list-candidates.rpc-handler"
import { handleUnassignGameAsset } from "./game-assets/unassign.rpc-handler"
import { handleGetHello } from "./hello/rpc-handler"
import { handleLaunchLibrary } from "./library/launch.rpc-handler"
import { handleSourceStatus } from "./source/status.rpc-handler"
import { handleSteamStatus } from "./steam/status.rpc-handler"
import { handlePrepareStream } from "./stream/prepare.rpc-handler"
import { handleGetStreamControlConfig } from "./stream-control/get-config.rpc-handler"
import { handleGetStreamControlControls } from "./stream-control/get-controls.rpc-handler"
import { handleGetStreamControlState } from "./stream-control/get-state.rpc-handler"
import { handleSetStreamControlAction } from "./stream-control/set-action.rpc-handler"
import { handleSetBrightness } from "./stream-control/set-brightness.rpc-handler"
import { handleSetMoonlightBitrate } from "./stream-control/set-moonlight-bitrate.rpc-handler"
import { handleSetMoonlightFps } from "./stream-control/set-moonlight-fps.rpc-handler"
import { handleSetMoonlightResolution } from "./stream-control/set-moonlight-resolution.rpc-handler"

export const HandlersLive = appRpcGroup.toLayer(
  appRpcGroup.of({
    "app.hello.get": handleGetHello,
    "app.game-assets.candidates.list": handleListGameAssetCandidates,
    "app.game-assets.assign": handleAssignGameAsset,
    "app.game-assets.unassign": handleUnassignGameAsset,
    "app.catalog.snapshot": handleCatalogSnapshot,
    "app.library.launch": handleLaunchLibrary,
    "app.source.status": handleSourceStatus,
    "app.steam.status": handleSteamStatus,
    "app.stream.prepare": handlePrepareStream,
    "app.stream-control.config.get": handleGetStreamControlConfig,
    "app.stream-control.controls.get": handleGetStreamControlControls,
    "app.stream-control.state.get": handleGetStreamControlState,
    "app.stream-control.brightness.set": handleSetBrightness,
    "app.stream-control.moonlight-bitrate.set": handleSetMoonlightBitrate,
    "app.stream-control.moonlight-fps.set": handleSetMoonlightFps,
    "app.stream-control.moonlight-resolution.set": handleSetMoonlightResolution,
    "app.stream-control.action.set": handleSetStreamControlAction,
  }),
)
