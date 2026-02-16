export type AgentState =
  | "GREET"
  | "INTENT"
  | "TRIAGE"
  | "PATIENT_TYPE"
  | "VERIFY"
  | "DETAILS"
  | "SLOTS"
  | "CONFIRM"
  | "DONE"
  | "TRANSFER";

export interface CollectedFields {
  intent?: "book" | "reschedule" | "cancel" | "office_info" | "front_desk" | "refill" | "other";
  patientType?: "new" | "existing";
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  reasonCategory?: string;
  providerPreference?: string;
  modality?: "in-person" | "phone" | "video";
  requestedDate?: string;
  appointmentId?: string;
  patientId?: string;
}

export interface SessionContext {
  callId: string;
  state: AgentState;
  fields: CollectedFields;
  lowConfidenceCount: number;
  silenceCount: number;
  transferRequested: boolean;
  endCall: boolean;
}

export interface TransitionInput {
  intent?: CollectedFields["intent"];
  emergency: boolean;
  wantsHuman: boolean;
}

export function initialContext(callId: string): SessionContext {
  return {
    callId,
    state: "GREET",
    fields: {},
    lowConfidenceCount: 0,
    silenceCount: 0,
    transferRequested: false,
    endCall: false
  };
}

export function nextState(ctx: SessionContext, input: TransitionInput): AgentState {
  if (input.wantsHuman || ctx.transferRequested) return "TRANSFER";
  if (input.emergency) return "DONE";

  switch (ctx.state) {
    case "GREET":
      return "INTENT";
    case "INTENT":
      if (input.intent === "office_info") return "DONE";
      if (input.intent === "front_desk" || input.intent === "refill") return "TRANSFER";
      return "TRIAGE";
    case "TRIAGE":
      return "PATIENT_TYPE";
    case "PATIENT_TYPE":
      return "VERIFY";
    case "VERIFY":
      if (ctx.fields.intent === "cancel" || ctx.fields.intent === "reschedule") return "SLOTS";
      return "DETAILS";
    case "DETAILS":
      return "SLOTS";
    case "SLOTS":
      return "CONFIRM";
    case "CONFIRM":
      return "DONE";
    case "TRANSFER":
    case "DONE":
      return ctx.state;
    default:
      return "TRANSFER";
  }
}
