import path from "node:path"
import { AcquisitionError } from "./errors"

export function resolveContainedArtifactPath(
  root: string,
  candidate: string,
): string {
  if (candidate.includes("\0")) {
    throw new AcquisitionError({
      reason: "unsafe-path",
      message: "Artifact path is not safe.",
    })
  }
  if (path.isAbsolute(candidate)) {
    throw new AcquisitionError({
      reason: "unsafe-path",
      message: "Artifact path is not safe.",
    })
  }
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, candidate)
  const relative = path.relative(resolvedRoot, resolved)
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new AcquisitionError({
      reason: "unsafe-path",
      message: "Artifact path is not safe.",
    })
  }
  return resolved
}
