import { ApiError } from "@platform/api/rpc/errors"
import { PluginListResponse } from "@platform/protocol/acquisition/plugin"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionPluginsPayload = Schema.Struct({})
export type AcquisitionPluginsPayload = Schema.Schema.Type<
  typeof AcquisitionPluginsPayload
>

export const AcquisitionPluginsRpc = Rpc.make("app.acquisition.providers", {
  payload: AcquisitionPluginsPayload,
  success: PluginListResponse,
  error: ApiError,
})
