const EMERGENCY_PATTERNS = [
  /chest pain/i,
  /severe shortness of breath/i,
  /stroke/i,
  /heavy bleeding/i,
  /fainting/i,
  /severe allergic reaction/i,
  /suicidal/i,
  /self[- ]harm/i
];

const URGENT_PATTERNS = [/can't breathe/i, /difficulty breathing/i, /passing out/i];

export interface SafetyResult {
  emergency: boolean;
  urgent: boolean;
  reason?: string;
}

export function safetyTriage(input: string): SafetyResult {
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.test(input)) {
      return { emergency: true, urgent: true, reason: pattern.source };
    }
  }
  for (const pattern of URGENT_PATTERNS) {
    if (pattern.test(input)) {
      return { emergency: false, urgent: true, reason: pattern.source };
    }
  }
  return { emergency: false, urgent: false };
}
