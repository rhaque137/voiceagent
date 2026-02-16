import type { ClinicInfo } from "./types.js";

export const SYSTEM_PROMPT = `You are Alex, the clinic's automated assistant.
Be warm, concise, and clear for phone audio.
Ask one question at a time.
Do not provide diagnosis or treatment advice.
Use high-level reason categories only.
Default to front desk transfer if uncertain.`;

export function greetingPrompt(clinic: ClinicInfo): string {
  return `Hello, this is Alex, the automated assistant for ${clinic.name}. I can help with appointments or connect you to the front desk. How can I help today?`;
}

export function emergencyPrompt(): string {
  return "This may be urgent. Please call 911, or your local emergency number, or go to the nearest emergency department now.";
}

export function transferPrefacePrompt(): string {
  return "I will connect you now. Before I do, I will share a short summary so the front desk can help faster.";
}
