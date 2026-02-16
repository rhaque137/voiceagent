export function redactSensitive(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[DOB_REDACTED]")
    .replace(/\+?1?[-.\s(]*\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}/g, "[PHONE_REDACTED]");
}

export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(redactSensitive(JSON.stringify(obj))) as T;
}
