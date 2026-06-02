import { Effect } from "effect"
import {
  type GetStreamControlConfigPayload,
  GetStreamControlConfigResponse,
} from "./get-config.rpc"
import {
  type GetStreamControlStatePayload,
  GetStreamControlStateResponse,
} from "./get-state.rpc"
import { StreamControl } from "./service"
import {
  type SetGamescopeFilterPayload,
  SetGamescopeFilterResponse,
} from "./set-gamescope-filter.rpc"
import {
  type SetGamescopeFpsPayload,
  SetGamescopeFpsResponse,
} from "./set-gamescope-fps.rpc"
import {
  type SetGamescopeModePayload,
  SetGamescopeModeResponse,
} from "./set-gamescope-mode.rpc"
import {
  type SetGamescopeSharpnessPayload,
  SetGamescopeSharpnessResponse,
} from "./set-gamescope-sharpness.rpc"
import {
  type SetMoonlightBitratePayload,
  SetMoonlightBitrateResponse,
} from "./set-moonlight-bitrate.rpc"
import {
  type SetMoonlightFpsPayload,
  SetMoonlightFpsResponse,
} from "./set-moonlight-fps.rpc"
import {
  type SetMoonlightResolutionPayload,
  SetMoonlightResolutionResponse,
} from "./set-moonlight-resolution.rpc"

export const handleGetStreamControlConfig = (
  _payload: typeof GetStreamControlConfigPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.config()
    return new GetStreamControlConfigResponse(response)
  })

export const handleGetStreamControlState = (
  _payload: typeof GetStreamControlStatePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.state()
    return new GetStreamControlStateResponse(response)
  })

export const handleSetMoonlightBitrate = (
  payload: typeof SetMoonlightBitratePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightBitrate(payload)
    return new SetMoonlightBitrateResponse(response)
  })

export const handleSetMoonlightFps = (
  payload: typeof SetMoonlightFpsPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightFps(payload)
    return new SetMoonlightFpsResponse(response)
  })

export const handleSetMoonlightResolution = (
  payload: typeof SetMoonlightResolutionPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setMoonlightResolution(payload)
    return new SetMoonlightResolutionResponse(response)
  })

export const handleSetGamescopeMode = (
  payload: typeof SetGamescopeModePayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeMode(payload)
    return new SetGamescopeModeResponse(response)
  })

export const handleSetGamescopeFps = (
  payload: typeof SetGamescopeFpsPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeFps(payload)
    return new SetGamescopeFpsResponse(response)
  })

export const handleSetGamescopeFilter = (
  payload: typeof SetGamescopeFilterPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeFilter(payload)
    return new SetGamescopeFilterResponse(response)
  })

export const handleSetGamescopeSharpness = (
  payload: typeof SetGamescopeSharpnessPayload.Type,
) =>
  Effect.gen(function* () {
    const service = yield* StreamControl
    const response = yield* service.setGamescopeSharpness(payload)
    return new SetGamescopeSharpnessResponse(response)
  })
