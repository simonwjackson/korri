import { ApiError } from "@platform/api/rpc/errors"
import {
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionResolveDownloadRpc = Rpc.make(
  "app.acquisition.resolve-download",
  {
    payload: ResolveDownloadRequest,
    success: DownloadResolution,
    error: ApiError,
  },
)
