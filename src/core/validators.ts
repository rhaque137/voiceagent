export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function parsePhone(text: string): string | undefined {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

export function parseDob(text: string): string | undefined {
  const match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match?.[1];
}

export function parseName(text: string): { firstName: string; lastName: string } | undefined {
  const parts = normalizeText(text).split(" ");
  if (parts.length < 2) return undefined;
  const [firstName, lastName] = parts;
  if (!/^[A-Za-z'-]+$/.test(firstName) || !/^[A-Za-z'-]+$/.test(lastName)) return undefined;
  return { firstName, lastName };
}

export function parseAppointmentId(text: string): string | undefined {
  const match = text.match(/\b(appt-\d+)\b/i);
  return match?.[1].toLowerCase();
}

export function parseDate(text: string): string | undefined {
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1];
}
