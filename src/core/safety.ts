const EMERGENCY_PATTERNS = [
  /chest pain/i,
  /severe shortness of breath/i,
  /stroke/i,
  /heavy bleeding/i,
  /faint(ing)?/i,
  /severe allergic reaction/i,
  /suicidal/i,
  /self[- ]harm/i
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));
}

export function emergencyResponse(): string[] {
  return [
    "This may be urgent.",
    "Please call 911 or go to the nearest emergency department now.",
    "I can connect you to the front desk after you get emergency help.",
    "I am sorry you are going through this. Please get emergency help right now."
  ];
}
