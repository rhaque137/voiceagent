export interface SessionSummary {
  sessionId: string;
  intent?: string;
  patientName?: string;
  reasonCategory?: string;
  disposition: "booked" | "rescheduled" | "cancelled" | "transferred" | "info" | "emergency" | "incomplete";
  confirmationId?: string;
  notes: string[];
}

export function buildTransferSummary(summary: SessionSummary): string {
  return [
    `Session ${summary.sessionId}`,
    `Intent ${summary.intent ?? "unknown"}`,
    `Patient ${summary.patientName ?? "unverified"}`,
    `Reason ${summary.reasonCategory ?? "unspecified"}`,
    `Disposition ${summary.disposition}`,
    `Notes ${summary.notes.join(" | ") || "none"}`
  ].join("; ");
}
