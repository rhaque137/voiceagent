import type { StructuredSummary } from "./types.js";

export function generateHandoffSummary(summary: StructuredSummary): string {
  const lines = [
    `Call ID: ${summary.callId}`,
    `Intent: ${summary.intent}`,
    `Patient: ${summary.patientName ?? "not verified"}`,
    `Reason: ${summary.reasonCategory ?? "unspecified"}`,
    `Disposition: ${summary.disposition}`,
    `Notes: ${summary.notes.join(" | ") || "none"}`
  ];
  return lines.join("; ");
}
