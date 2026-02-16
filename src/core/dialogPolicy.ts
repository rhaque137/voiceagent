import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectEmergency, emergencyResponse } from "./safety.js";
import { parseAppointmentId, parseDate, parseDob, parseName, parsePhone } from "./validators.js";
import { initialContext, nextState, type AgentState, type SessionContext } from "./stateMachine.js";
import { createSchedulerApi, rangeAroundDay, rangeNextDays, type SchedulerApi } from "../scheduler/schedulerApi.js";

interface ClinicConfig {
  name: string;
  timezone: string;
  hours: Record<string, string>;
  address: string;
  parking: string;
  fax: string;
  frontDeskNumber: string;
  acceptingNewPatients: boolean;
}

export interface PolicyResult {
  prompt: string;
  state: AgentState;
  actions: Array<{ type: "transfer" | "book" | "reschedule" | "cancel" | "end"; payload?: Record<string, string> }>;
  endCall: boolean;
}

export class DialogPolicy {
  private scheduler: SchedulerApi;
  private clinic: ClinicConfig;
  private slotCache: Map<string, string[]> = new Map();

  constructor(scheduler: SchedulerApi = createSchedulerApi()) {
    this.scheduler = scheduler;
    this.clinic = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/config/clinic.json"), "utf8")
    ) as ClinicConfig;
  }

  createContext(callId: string): SessionContext {
    return initialContext(callId);
  }

  async handleUtterance(ctx: SessionContext, transcript: string, confidence = 0.85): Promise<PolicyResult> {
    const text = transcript.trim();
    const lower = text.toLowerCase();

    if (confidence < 0.5) {
      ctx.lowConfidenceCount += 1;
      if (ctx.lowConfidenceCount >= 2) {
        ctx.transferRequested = true;
        ctx.state = "TRANSFER";
        return {
          prompt: "I want to make sure you get help quickly. I can connect you to the front desk now.",
          state: ctx.state,
          actions: [{ type: "transfer" }],
          endCall: false
        };
      }
      return {
        prompt: "Sorry, I did not catch that. Please repeat.",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (/(human|person|front desk|reception)/i.test(lower)) {
      ctx.transferRequested = true;
      ctx.state = "TRANSFER";
      return {
        prompt: "I will connect you to the front desk now.",
        state: ctx.state,
        actions: [{ type: "transfer" }],
        endCall: false
      };
    }

    const emergency = detectEmergency(lower);
    if (emergency) {
      ctx.endCall = true;
      ctx.state = "DONE";
      return {
        prompt: emergencyResponse().join(" "),
        state: ctx.state,
        actions: [{ type: "end" }],
        endCall: true
      };
    }

    if (ctx.state === "GREET") {
      ctx.state = nextState(ctx, { emergency: false, wantsHuman: false });
      return {
        prompt: `Thanks for calling ${this.clinic.name}. This is Alex, the automated assistant. How can I help today: schedule, reschedule, cancel, office info, or connect to front desk?`,
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "INTENT") {
      ctx.fields.intent = this.detectIntent(lower);
      ctx.state = nextState(ctx, { intent: ctx.fields.intent, emergency: false, wantsHuman: false });

      if (ctx.fields.intent === "office_info") {
        return {
          prompt: `Our address is ${this.clinic.address}. Parking: ${this.clinic.parking}. Fax: ${this.clinic.fax}.`,
          state: ctx.state,
          actions: [{ type: "end" }],
          endCall: true
        };
      }

      if (ctx.state === "TRANSFER") {
        return {
          prompt: "I will connect you to the front desk now.",
          state: ctx.state,
          actions: [{ type: "transfer" }],
          endCall: false
        };
      }

      return {
        prompt: "Before we continue, are you calling about urgent symptoms today?",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "TRIAGE") {
      ctx.state = nextState(ctx, { emergency: false, wantsHuman: false });
      return {
        prompt: "Are you a new patient or existing patient?",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "PATIENT_TYPE") {
      ctx.fields.patientType = /new/.test(lower) ? "new" : "existing";
      if (ctx.fields.patientType === "new" && !this.clinic.acceptingNewPatients) {
        ctx.state = "TRANSFER";
        return {
          prompt: "We will connect you to the front desk for new patient intake.",
          state: ctx.state,
          actions: [{ type: "transfer" }],
          endCall: false
        };
      }
      ctx.state = nextState(ctx, { emergency: false, wantsHuman: false });
      return {
        prompt: "Please say your full name.",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "VERIFY") {
      if (!ctx.fields.firstName || !ctx.fields.lastName) {
        const name = parseName(text);
        if (!name) {
          return {
            prompt: "Please say your first and last name clearly.",
            state: ctx.state,
            actions: [],
            endCall: false
          };
        }
        ctx.fields.firstName = name.firstName;
        ctx.fields.lastName = name.lastName;
        return {
          prompt: "For verification, please provide date of birth in YYYY-MM-DD or phone number on file.",
          state: ctx.state,
          actions: [],
          endCall: false
        };
      }

      const dob = parseDob(text);
      const phone = parsePhone(text);
      if (!dob && !phone) {
        return {
          prompt: "I can transfer you if you prefer. Otherwise please provide your date of birth or phone on file.",
          state: ctx.state,
          actions: [],
          endCall: false
        };
      }
      if (dob) ctx.fields.dob = dob;
      if (phone) ctx.fields.phone = phone;

      if (ctx.fields.patientType === "new") {
        const patientId = await this.scheduler.createPatient({
          firstName: ctx.fields.firstName,
          lastName: ctx.fields.lastName,
          dob: ctx.fields.dob ?? "1900-01-01",
          phone: ctx.fields.phone ?? "+10000000000"
        });
        ctx.fields.patientId = patientId;
      } else {
        const patientId = await this.scheduler.lookupPatient(
          `${ctx.fields.firstName} ${ctx.fields.lastName}`,
          ctx.fields.dob ?? ctx.fields.phone ?? ""
        );
        if (!patientId) {
          ctx.state = "TRANSFER";
          return {
            prompt: "I could not verify your account. I will connect you to the front desk.",
            state: ctx.state,
            actions: [{ type: "transfer" }],
            endCall: false
          };
        }
        ctx.fields.patientId = patientId;
      }

      ctx.state = nextState(ctx, { emergency: false, wantsHuman: false });

      if (ctx.fields.intent === "cancel") {
        return {
          prompt: "Please provide the appointment ID to cancel, for example appt-500.",
          state: ctx.state,
          actions: [],
          endCall: false
        };
      }
      if (ctx.fields.intent === "reschedule") {
        return {
          prompt: "Please provide your appointment ID, then your preferred date in YYYY-MM-DD.",
          state: ctx.state,
          actions: [],
          endCall: false
        };
      }

      return {
        prompt: "What type of appointment do you need: annual checkup, follow-up, new issue, forms, or vaccination?",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "DETAILS") {
      if (!ctx.fields.reasonCategory) {
        ctx.fields.reasonCategory = this.detectReasonCategory(lower);
      }
      if (!ctx.fields.modality) {
        ctx.fields.modality = this.detectModality(lower);
      }
      if (!ctx.fields.providerPreference) {
        const provider = lower.match(/dr\.?\s+([a-z]+)/i);
        if (provider) ctx.fields.providerPreference = `Dr. ${provider[1][0].toUpperCase()}${provider[1].slice(1).toLowerCase()}`;
      }
      ctx.state = nextState(ctx, { emergency: false, wantsHuman: false });
      return {
        prompt: "Do you want earliest available, or a preferred date in YYYY-MM-DD?",
        state: ctx.state,
        actions: [],
        endCall: false
      };
    }

    if (ctx.state === "SLOTS") {
      if (ctx.fields.intent === "cancel") {
        const apptId = parseAppointmentId(text);
        if (!apptId) {
          return {
            prompt: "Please repeat the appointment ID like appt-500.",
            state: ctx.state,
            actions: [],
            endCall: false
          };
        }
        const cancellationId = await this.scheduler.cancel(apptId);
        ctx.state = "CONFIRM";
        return {
          prompt: `Done. Your appointment is cancelled. Confirmation ${cancellationId}.`,
          state: ctx.state,
          actions: [{ type: "cancel", payload: { confirmationId: cancellationId } }],
          endCall: false
        };
      }

      if (ctx.fields.intent === "reschedule") {
        if (!ctx.fields.appointmentId) {
          const apptId = parseAppointmentId(text);
          if (!apptId) {
            return {
              prompt: "Please provide your appointment ID first.",
              state: ctx.state,
              actions: [],
              endCall: false
            };
          }
          ctx.fields.appointmentId = apptId;
          return {
            prompt: "Now tell me your preferred date in YYYY-MM-DD.",
            state: ctx.state,
            actions: [],
            endCall: false
          };
        }

        const date = parseDate(text);
        const range = date ? rangeAroundDay(date, 3) : rangeNextDays(14);
        const slots = await this.scheduler.getAvailableSlots("follow-up", range, ctx.fields.providerPreference, ctx.fields.modality);
        const top = slots.slice(0, 3);
        if (!top.length) {
          ctx.state = "TRANSFER";
          return {
            prompt: "I could not find open slots there. I can connect you to the front desk.",
            state: ctx.state,
            actions: [{ type: "transfer" }],
            endCall: false
          };
        }
        const confirmationId = await this.scheduler.reschedule(ctx.fields.appointmentId, top[0].id);
        ctx.state = "CONFIRM";
        return {
          prompt: `Rescheduled to ${this.formatSlot(top[0].startIso)} with ${top[0].providerName}. Confirmation ${confirmationId}.`,
          state: ctx.state,
          actions: [{ type: "reschedule", payload: { confirmationId } }],
          endCall: false
        };
      }

      const date = parseDate(text);
      const range = /earliest/.test(lower) || !date ? rangeNextDays(14) : rangeAroundDay(date, 3);
      const slots = await this.scheduler.getAvailableSlots(
        ctx.fields.reasonCategory ?? "follow-up",
        range,
        ctx.fields.providerPreference,
        ctx.fields.modality
      );
      const top = slots.slice(0, 3);

      if (!top.length) {
        const widened = await this.scheduler.getAvailableSlots(ctx.fields.reasonCategory ?? "follow-up", rangeNextDays(30), ctx.fields.providerPreference, ctx.fields.modality);
        if (!widened.length) {
          ctx.state = "TRANSFER";
          return {
            prompt: "I do not have openings right now. I can put you on waitlist with the front desk.",
            state: ctx.state,
            actions: [{ type: "transfer" }],
            endCall: false
          };
        }
        this.slotCache.set(ctx.callId, widened.slice(0, 3).map((s) => s.id));
        const prompt = widened
          .slice(0, 3)
          .map((s, i) => `${i + 1}. ${this.formatSlot(s.startIso)} with ${s.providerName}`)
          .join(" ");
        return {
          prompt: `I widened the search. I found: ${prompt}. I will book option 1 unless you prefer another.`,
          state: ctx.state,
          actions: [],
          endCall: false
        };
      }

      this.slotCache.set(ctx.callId, top.map((s) => s.id));
      const confirmationId = await this.scheduler.book(top[0].id, ctx.fields.patientId ?? "unknown", ctx.fields.reasonCategory ?? "follow-up");
      ctx.state = "CONFIRM";
      return {
        prompt: `Booked for ${this.formatSlot(top[0].startIso)} with ${top[0].providerName}. Confirmation ${confirmationId}.`,
        state: ctx.state,
        actions: [{ type: "book", payload: { confirmationId } }],
        endCall: false
      };
    }

    if (ctx.state === "CONFIRM") {
      ctx.state = "DONE";
      ctx.endCall = true;
      return {
        prompt: "Thanks. Your request is complete. Is there anything else today? Goodbye.",
        state: ctx.state,
        actions: [{ type: "end" }],
        endCall: true
      };
    }

    if (ctx.state === "TRANSFER") {
      return {
        prompt: "Connecting you to front desk now.",
        state: ctx.state,
        actions: [{ type: "transfer" }],
        endCall: false
      };
    }

    return {
      prompt: "Thanks for calling. Goodbye.",
      state: "DONE",
      actions: [{ type: "end" }],
      endCall: true
    };
  }

  onSilence(ctx: SessionContext): PolicyResult {
    ctx.silenceCount += 1;
    if (ctx.silenceCount === 1) {
      return { prompt: "I am still here. What would you like to do next?", state: ctx.state, actions: [], endCall: false };
    }
    if (ctx.silenceCount === 2) {
      return {
        prompt: "If you prefer, I can connect you to the front desk now.",
        state: "TRANSFER",
        actions: [{ type: "transfer" }],
        endCall: false
      };
    }
    ctx.state = "DONE";
    ctx.endCall = true;
    return {
      prompt: "I will end this call for now. Thank you for calling.",
      state: ctx.state,
      actions: [{ type: "end" }],
      endCall: true
    };
  }

  private detectIntent(lower: string): SessionContext["fields"]["intent"] {
    if (/reschedule|move/.test(lower)) return "reschedule";
    if (/cancel/.test(lower)) return "cancel";
    if (/schedule|book|appointment/.test(lower)) return "book";
    if (/hours|address|parking|fax/.test(lower)) return "office_info";
    if (/prescription|refill/.test(lower)) return "refill";
    if (/front desk|human|reception/.test(lower)) return "front_desk";
    return "other";
  }

  private detectReasonCategory(lower: string): string {
    if (/annual|physical|checkup/.test(lower)) return "annual checkup";
    if (/follow/.test(lower)) return "follow-up";
    if (/form|paperwork/.test(lower)) return "forms";
    if (/vaccine|shot/.test(lower)) return "vaccination";
    return "new issue";
  }

  private detectModality(lower: string): "in-person" | "phone" | "video" {
    if (/video/.test(lower)) return "video";
    if (/phone/.test(lower)) return "phone";
    return "in-person";
  }

  private formatSlot(startIso: string): string {
    const d = new Date(startIso);
    return d.toLocaleString("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: this.clinic.timezone
    });
  }
}
