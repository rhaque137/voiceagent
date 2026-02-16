export type Intent =
  | "book"
  | "reschedule"
  | "cancel"
  | "front_desk"
  | "new_patient"
  | "billing"
  | "prescription_refill"
  | "test_results"
  | "general_info"
  | "complaint"
  | "other";

export type Modality = "in-person" | "phone" | "video";

export type AgentState =
  | "S0"
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S9"
  | "SERR";

export interface NLUResult {
  intent: Intent;
  confidence: number;
  entities: Partial<ConversationEntities>;
}

export interface ConversationEntities {
  fullName: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  postalCode: string;
  reasonCategory: string;
  providerName: string;
  providerId: string;
  modality: Modality;
  timeframe: "earliest" | "specific";
  requestedDateISO: string;
  requestedTime: string;
  callbackNumber: string;
  appointmentId: string;
  existingAppointmentId: string;
}

export interface ClinicInfo {
  name: string;
  timezone: string;
  hours: Record<string, string>;
  address: string;
  parking: string;
  fax: string;
  acceptingNewPatients: boolean;
  modalities: Modality[];
  providers: Array<{ id: string; name: string }>;
  appointmentTypes: string[];
  frontDeskNumber: string;
}

export interface PatientProfile {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email?: string;
  postalCode?: string;
}

export interface PatientRecord extends PatientProfile {
  id: string;
}

export interface Slot {
  id: string;
  providerId: string;
  providerName: string;
  startISO: string;
  modality: Modality;
  appointmentType: string;
}

export interface AppointmentRecord {
  id: string;
  patientId: string;
  slotId: string;
  reasonCategory: string;
  callbackNumber: string;
}

export interface StructuredSummary {
  callId: string;
  intent: Intent;
  patientName?: string;
  verificationMethod?: "dob" | "phone" | "none";
  reasonCategory?: string;
  disposition: "booked" | "rescheduled" | "cancelled" | "transferred" | "info_only" | "emergency_redirect" | "incomplete";
  confirmationId?: string;
  notes: string[];
}

export interface AgentOutcome {
  disposition: StructuredSummary["disposition"];
  confirmationId?: string;
  transferStatus?: string;
  emergency: boolean;
}

export interface CallTurn {
  speaker: "caller" | "alex";
  text: string;
}

export interface ConversationResult {
  turns: CallTurn[];
  outcome: AgentOutcome;
  summary: StructuredSummary;
}
