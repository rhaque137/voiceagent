import type { Intent, NLUResult } from "./types.js";
import { normalizeSpaces, parseDOB, parsePhone } from "./utils.js";

const INTENT_RULES: Array<{ intent: Intent; patterns: RegExp[] }> = [
  { intent: "reschedule", patterns: [/reschedule/i, /move .*appointment/i, /change .*time/i] },
  { intent: "cancel", patterns: [/cancel/i] },
  { intent: "book", patterns: [/book/i, /appointment/i, /see a doctor/i, /earliest available/i] },
  { intent: "front_desk", patterns: [/front desk/i, /reception/i, /put me through/i, /human/i] },
  { intent: "billing", patterns: [/billing/i, /insurance/i, /invoice/i, /payment/i] },
  { intent: "prescription_refill", patterns: [/prescription/i, /refill/i, /medication/i] },
  { intent: "test_results", patterns: [/results/i, /lab/i, /test result/i] },
  { intent: "complaint", patterns: [/complaint/i, /escalate/i, /supervisor/i] },
  { intent: "general_info", patterns: [/hours/i, /address/i, /parking/i, /fax/i, /where .*located/i] },
  { intent: "new_patient", patterns: [/new patient/i, /first time/i, /never been there/i] }
];

const CATEGORY_RULES: Array<{ category: string; patterns: RegExp[] }> = [
  { category: "annual checkup", patterns: [/annual/i, /physical/i, /checkup/i] },
  { category: "follow-up", patterns: [/follow[- ]?up/i] },
  { category: "forms", patterns: [/form/i, /paperwork/i] },
  { category: "vaccination", patterns: [/vaccine/i, /vaccination/i, /shot/i] },
  { category: "new issue", patterns: [/new issue/i, /new problem/i, /concern/i] }
];

export function classifyIntent(input: string): NLUResult {
  const text = normalizeSpaces(input);
  const lowered = text.toLowerCase();

  let intent: Intent = "other";
  let confidence = 0.45;

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      intent = rule.intent;
      confidence = 0.88;
      break;
    }
  }

  if (/^\?+$/.test(lowered) || lowered.length < 2 || /(mumble|inaudible|unclear)/i.test(text)) {
    confidence = 0.2;
  }

  const entities: NLUResult["entities"] = {};

  const fullNameMatch = text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
  if (fullNameMatch) {
    entities.fullName = fullNameMatch[1];
    const [firstName, lastName] = fullNameMatch[1].split(/\s+/, 2);
    entities.firstName = firstName;
    entities.lastName = lastName;
  }

  const dob = parseDOB(text);
  if (dob) entities.dob = dob;

  const phone = parsePhone(text);
  if (phone) {
    entities.phone = phone;
    entities.callbackNumber = phone;
  }

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) entities.email = email[0].toLowerCase();

  const postal = text.match(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i);
  if (postal) entities.postalCode = postal[0].toUpperCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      entities.reasonCategory = rule.category;
      break;
    }
  }

  if (/earliest/i.test(text)) entities.timeframe = "earliest";

  const date = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (date) {
    entities.requestedDateISO = date[1];
    entities.timeframe = "specific";
  }

  const time = text.match(/\b(\d{1,2}:\d{2}\s?(?:am|pm)?)\b/i);
  if (time) entities.requestedTime = time[1];

  const provider = text.match(/dr\.?\s+([A-Z][a-z]+)/i);
  if (provider) entities.providerName = `Dr. ${provider[1]}`;

  if (/in[- ]person/i.test(text)) entities.modality = "in-person";
  if (/\bphone\b/i.test(text)) entities.modality = "phone";
  if (/\bvideo\b/i.test(text)) entities.modality = "video";

  const apptId = text.match(/\bappt[- ]?(\d{3,})\b/i);
  if (apptId) {
    entities.existingAppointmentId = `appt-${apptId[1]}`;
    entities.appointmentId = `appt-${apptId[1]}`;
  }

  return { intent, confidence, entities };
}
