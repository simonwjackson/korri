export interface FolderReceiptState {
  readonly submitting: ReadonlySet<string>
  readonly completed: ReadonlySet<string>
  readonly uncertain: ReadonlySet<string>
  readonly unknown: ReadonlySet<string>
  readonly reportedUnknown: ReadonlySet<string>
}

export type FolderReceiptSelectedDecision =
  | {
      readonly _tag: "Submit"
      readonly state: FolderReceiptState
    }
  | {
      readonly _tag: "AcknowledgeCompleted"
      readonly generation: string
      readonly state: FolderReceiptState
    }
  | {
      readonly _tag: "ReportUnknown"
      readonly message: string
      readonly state: FolderReceiptState
    }
  | {
      readonly _tag: "Ignore"
      readonly state: FolderReceiptState
    }

export type FolderReceiptRegistrationKind =
  | "Accepted"
  | "BrainUnreachable"
  | "ReceiptUnknown"
  | "Rejected"

export type FolderReceiptRegistrationDecision =
  | {
      readonly _tag: "Acknowledge"
      readonly generation: string
      readonly state: FolderReceiptState
    }
  | {
      readonly _tag: "ReportProblem"
      readonly message: string
      readonly state: FolderReceiptState
    }
  | {
      readonly _tag: "ReportUnknown"
      readonly message: string
      readonly state: FolderReceiptState
    }

const unknownReceiptMessage =
  "Korri could not confirm that folder after reconnecting. Choose it again."

export function initialFolderReceiptState(): FolderReceiptState {
  return {
    submitting: new Set(),
    completed: new Set(),
    uncertain: new Set(),
    unknown: new Set(),
    reportedUnknown: new Set(),
  }
}

export function selectFolderReceipt(
  state: FolderReceiptState,
  generation: string,
): FolderReceiptSelectedDecision {
  if (state.unknown.has(generation)) {
    if (state.reportedUnknown.has(generation)) {
      return { _tag: "Ignore", state }
    }
    return {
      _tag: "ReportUnknown",
      message: unknownReceiptMessage,
      state: withAdded(state, "reportedUnknown", generation),
    }
  }
  if (state.completed.has(generation)) {
    return { _tag: "AcknowledgeCompleted", generation, state }
  }
  if (state.submitting.has(generation)) {
    return { _tag: "Ignore", state }
  }
  return {
    _tag: "Submit",
    state: withAdded(state, "submitting", generation),
  }
}

export function completeFolderReceiptRegistration(
  state: FolderReceiptState,
  generation: string,
  kind: FolderReceiptRegistrationKind,
  problemMessage: string,
): FolderReceiptRegistrationDecision {
  const withoutSubmission = withDeleted(state, "submitting", generation)
  switch (kind) {
    case "Accepted":
      return acknowledgeCompleted(withoutSubmission, generation)
    case "BrainUnreachable":
      return {
        _tag: "ReportProblem",
        message: problemMessage,
        state: withAdded(withoutSubmission, "uncertain", generation),
      }
    case "ReceiptUnknown":
      if (!withoutSubmission.uncertain.has(generation)) {
        return acknowledgeCompleted(withoutSubmission, generation)
      }
      return {
        _tag: "ReportUnknown",
        message: unknownReceiptMessage,
        state: withAdded(
          withAdded(
            withDeleted(withoutSubmission, "uncertain", generation),
            "unknown",
            generation,
          ),
          "reportedUnknown",
          generation,
        ),
      }
    case "Rejected":
      return acknowledgeCompleted(withoutSubmission, generation)
  }
}

export function releaseUnknownFolderReceipt(
  state: FolderReceiptState,
  generation: string,
): FolderReceiptState {
  return clearUncertainOutcome(
    withDeleted(
      withDeleted(state, "submitting", generation),
      "completed",
      generation,
    ),
    generation,
  )
}

function acknowledgeCompleted(
  state: FolderReceiptState,
  generation: string,
): FolderReceiptRegistrationDecision {
  return {
    _tag: "Acknowledge",
    generation,
    state: clearUncertainOutcome(
      withAdded(state, "completed", generation),
      generation,
    ),
  }
}

function clearUncertainOutcome(
  state: FolderReceiptState,
  generation: string,
): FolderReceiptState {
  return withDeleted(
    withDeleted(
      withDeleted(state, "uncertain", generation),
      "unknown",
      generation,
    ),
    "reportedUnknown",
    generation,
  )
}

function withAdded(
  state: FolderReceiptState,
  key: keyof FolderReceiptState,
  generation: string,
): FolderReceiptState {
  return {
    ...state,
    [key]: new Set([...state[key], generation]),
  }
}

function withDeleted(
  state: FolderReceiptState,
  key: keyof FolderReceiptState,
  generation: string,
): FolderReceiptState {
  if (!state[key].has(generation)) return state
  const next = new Set(state[key])
  next.delete(generation)
  return { ...state, [key]: next }
}
