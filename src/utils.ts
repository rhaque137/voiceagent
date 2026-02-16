import type { Slot } from "./types.js";

export function normalizeSpaces(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function parsePhone(input: string): string | undefined {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return undefined;
}

export function formatPhoneForReadback(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return phone;
  const body = digits.length === 11 ? digits.slice(1) : digits;
  return `${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6, 10)}`;
}

export function parseDOB(input: string): string | undefined {
  const m = input.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!m) return undefined;
  const [, y, mm, dd] = m;
  const date = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${y}-${mm}-${dd}`;
}

export function formatDateLong(isoDateOrDateTime: string, timezone = "America/Toronto"): string {
  const d = new Date(isoDateOrDateTime);
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone
  }).format(d);
}

export function formatTime(isoDateTime: string, timezone = "America/Toronto"): string {
  const d = new Date(isoDateTime);
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone
  }).format(d);
}

export function redactSensitive(input: string): string {
  return input
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[DOB_REDACTED]")
    .replace(/\+?1?\D?\d{3}\D?\d{3}\D?\d{4}/g, "[PHONE_REDACTED]");
}

export function rankSlots(slots: Slot[], providerId?: string): Slot[] {
  return [...slots].sort((a, b) => {
    const providerBoostA = providerId && a.providerId === providerId ? -1 : 0;
    const providerBoostB = providerId && b.providerId === providerId ? -1 : 0;
    if (providerBoostA !== providerBoostB) return providerBoostA - providerBoostB;
    return new Date(a.startISO).getTime() - new Date(b.startISO).getTime();
  });
}

export function takeTop<T>(items: T[], n: number): T[] {
  return items.slice(0, n);
}

export function dayRangeAround(dateISO: string, days = 3): { start: string; end: string } {
  const dt = new Date(`${dateISO}T12:00:00Z`);
  const start = new Date(dt);
  const end = new Date(dt);
  start.setUTCDate(start.getUTCDate() - days);
  end.setUTCDate(end.getUTCDate() + days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export function nextNDaysRange(days = 14): { start: string; end: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return {
    start: now.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}
