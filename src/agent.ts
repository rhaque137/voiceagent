import { classifyIntent } from "./nlu.js";
import { greetingPrompt, emergencyPrompt, transferPrefacePrompt } from "./prompts.js";
import { safetyTriage } from "./safety.js";
import { createSchedulerAdapter, type SchedulerAdapter } from "./scheduler.js";
import { generateHandoffSummary } from "./transfer.js";
import type { AgentState, ConversationEntities, ConversationResult, Intent, StructuredSummary } from "./types.js";
import {
  dayRangeAround,
  formatDateLong,
  formatPhoneForReadback,
  formatTime,
  nextNDaysRange,
  rankSlots,
  redactSensitive,
  takeTop
} from "./utils.js";

const NON_SCHEDULING_TRANSFER_INTENTS: Intent[] = ["billing", "prescription_refill", "test_results", "complaint"];

export class AlexAgent {
  private scheduler: SchedulerAdapter;
  private maxRecoveryAttempts = 2;

  constructor(scheduler = createSchedulerAdapter()) {
    this.scheduler = scheduler;
  }

  async runScriptedConversation(callId: string, callerUtterances: string[]): Promise<ConversationResult> {
    const clinic = await this.scheduler.get_clinic_info();
    const turns: ConversationResult["turns"] = [];
    let state: AgentState = "S0";
    let recoveryCount = 0;
    let emergency = false;
    let patientId: string | undefined;
    let selectedSlotId: string | undefined;
    let transferStatus: string | undefined;
    let confirmationId: string | undefined;

    const entities: Partial<ConversationEntities> = { modality: "in-person", timeframe: "earliest" };

    let intent: Intent = "other";
    let disposition: StructuredSummary["disposition"] = "incomplete";

    const say = (text: string): void => {
      turns.push({ speaker: "alex", text });
    };

    const hear = (text: string): void => {
      turns.push({ speaker: "caller", text });
    };

    say(greetingPrompt(clinic));
    state = "S1";

    for (const utterance of callerUtterances) {
      hear(utterance);

      const safety = safetyTriage(utterance);
      if (safety.emergency) {
        state = "S2";
        emergency = true;
        say("This may be urgent.");
        say(emergencyPrompt());
        say("I am sorry you are going through this. Please get emergency help right now.");
        disposition = "emergency_redirect";
        state = "S9";
        break;
      }

      const nlu = classifyIntent(utterance);
      Object.assign(entities, nlu.entities);

      const extractedUsefulEntity = Object.keys(nlu.entities).length > 0;
      const shouldRunAsrRecovery =
        nlu.confidence < 0.55 &&
        !extractedUsefulEntity &&
        (state === "S1" || state === "SERR" || utterance.trim().length < 2);

      if (shouldRunAsrRecovery) {
        recoveryCount += 1;
        state = "SERR";
        if (recoveryCount === 1) {
          say("Sorry, did you say that again?");
          continue;
        }
        if (recoveryCount >= this.maxRecoveryAttempts) {
          say("I can connect you to the front desk now.");
          say(transferPrefacePrompt());
          const summary: StructuredSummary = {
            callId,
            intent,
            disposition: "transferred",
            notes: ["Low ASR confidence", "Recovery limit reached"]
          };
          transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
          disposition = "transferred";
          state = "S8";
          break;
        }
      }

      if (state === "S1") {
        intent = nlu.intent;

        if (utterance.toLowerCase().includes("are you a real person")) {
          say("I am Alex, the clinic's automated assistant.");
        }

        if (intent === "general_info") {
          say(`Our hours are Monday to Friday based on clinic schedule. We are at ${clinic.address}.`);
          say(`Parking: ${clinic.parking} Fax: ${clinic.fax}.`);
          disposition = "info_only";
          state = "S9";
          break;
        }

        if (intent === "front_desk" || NON_SCHEDULING_TRANSFER_INTENTS.includes(intent)) {
          say(transferPrefacePrompt());
          const summary: StructuredSummary = {
            callId,
            intent,
            disposition: "transferred",
            notes: ["Direct transfer intent or unsupported request"]
          };
          transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
          disposition = "transferred";
          state = "S8";
          break;
        }

        if (!["book", "reschedule", "cancel", "new_patient"].includes(intent)) {
          say("I can help with appointments, or I can connect you to the front desk.");
          continue;
        }

        state = "S3";
        say("Are you a new patient or an existing patient?");
        continue;
      }

      if (state === "S3") {
        const isNew = /new patient|first time|new/i.test(utterance) || intent === "new_patient";

        if (isNew) {
          intent = "book";
          if (!clinic.acceptingNewPatients) {
            say("At the moment, we need to connect new patient requests to the front desk.");
            say(transferPrefacePrompt());
            const summary: StructuredSummary = {
              callId,
              intent: "new_patient",
              disposition: "transferred",
              notes: ["Clinic not accepting new patients"]
            };
            transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
            disposition = "transferred";
            state = "S8";
            break;
          }

          say("Please say your first and last name.");
          state = "S4";
          entities.reasonCategory ??= "new issue";
          continue;
        }

        say("Please say your first and last name.");
        state = "S4";
        continue;
      }

      if (state === "S4") {
        const nlu4 = classifyIntent(utterance);
        Object.assign(entities, nlu4.entities);

        if (!entities.firstName || !entities.lastName) {
          say("Sorry, I did not catch your full name. Please say first and last name.");
          continue;
        }

        if (!entities.dob && !entities.phone) {
          say("For verification, please provide your date of birth in YYYY-MM-DD, or phone number on file.");
          continue;
        }

        if (intent === "book" && (/new patient|first time/i.test(callerUtterances.join(" ")) || !entities.dob)) {
          if (!entities.phone) {
            say("Please provide your callback phone number.");
            continue;
          }
          patientId = await this.scheduler.create_new_patient({
            firstName: entities.firstName,
            lastName: entities.lastName,
            dob: entities.dob ?? "1900-01-01",
            phone: entities.phone,
            email: entities.email,
            postalCode: entities.postalCode
          });
        } else {
          const fullName = `${entities.firstName} ${entities.lastName}`;
          const secondary = entities.dob ?? entities.phone!;
          const lookedUpPatientId = await this.scheduler.lookup_patient(fullName, secondary);
          if (!lookedUpPatientId) {
            say("I could not verify your record. I can connect you to the front desk.");
            say(transferPrefacePrompt());
            const summary: StructuredSummary = {
              callId,
              intent,
              disposition: "transferred",
              patientName: fullName,
              notes: ["Identity verification failed"]
            };
            transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
            disposition = "transferred";
            state = "S8";
            break;
          }
          patientId = lookedUpPatientId;
        }

        say(`Thanks. I have ${entities.firstName} ${entities.lastName}.`);
        if (entities.phone) {
          say(`Your callback number is ${formatPhoneForReadback(entities.phone)}. Is that correct?`);
        }

        state = intent === "cancel" || intent === "reschedule" ? "S6" : "S5";
        if (state === "S5") {
          say("What appointment type do you need: annual checkup, follow-up, new issue, forms, or vaccination?");
        }
        if (state === "S6" && intent === "reschedule") {
          say("Please share your appointment ID, like appt-500.");
        }
        if (state === "S6" && intent === "cancel") {
          say("Please share the appointment ID to cancel, like appt-500.");
        }
        continue;
      }

      if (state === "S5") {
        const nlu5 = classifyIntent(utterance);
        Object.assign(entities, nlu5.entities);
        entities.reasonCategory ??= "follow-up";

        if (!entities.modality) entities.modality = "in-person";

        if (entities.providerName && !entities.providerId) {
          const provider = clinic.providers.find((p) => p.name.toLowerCase() === entities.providerName!.toLowerCase());
          entities.providerId = provider?.id;
        }

        say("Do you want the earliest available, or a specific date? You can say YYYY-MM-DD.");
        state = "S6";
        continue;
      }

      if (state === "S6") {
        const nlu6 = classifyIntent(utterance);
        Object.assign(entities, nlu6.entities);

        if (!patientId) {
          say("I need to verify you first. I can connect you to the front desk.");
          say(transferPrefacePrompt());
          const summary: StructuredSummary = {
            callId,
            intent,
            disposition: "transferred",
            notes: ["Missing patient context"]
          };
          transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
          disposition = "transferred";
          state = "S8";
          break;
        }

        if (intent === "cancel") {
          const apptId = entities.appointmentId ?? entities.existingAppointmentId;
          if (!apptId) {
            say("Please repeat the appointment ID.");
            continue;
          }
          confirmationId = await this.scheduler.cancel_appointment(patientId, apptId);
          disposition = "cancelled";
          state = "S7";
          say(`Your appointment is cancelled. Confirmation ${confirmationId}.`);
          break;
        }

        if (intent === "reschedule") {
          const apptId = entities.existingAppointmentId;
          if (!apptId) {
            say("Please share the existing appointment ID first.");
            continue;
          }
          const range = entities.requestedDateISO ? dayRangeAround(entities.requestedDateISO, 3) : nextNDaysRange(14);
          const slots = await this.scheduler.get_available_slots(
            entities.providerId,
            entities.reasonCategory ?? "follow-up",
            range,
            entities.modality ?? "in-person"
          );
          const ranked = takeTop(rankSlots(slots, entities.providerId), 3);
          if (!ranked.length) {
            say("I could not find times in that range. I can connect you to the front desk for more options.");
            disposition = "transferred";
            say(transferPrefacePrompt());
            const summary: StructuredSummary = {
              callId,
              intent,
              disposition,
              notes: ["No slots for reschedule"]
            };
            transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
            state = "S8";
            break;
          }
          selectedSlotId = ranked[0].id;
          confirmationId = await this.scheduler.reschedule_appointment(patientId, apptId, selectedSlotId);
          disposition = "rescheduled";
          state = "S7";
          say(`Rescheduled to ${formatDateLong(ranked[0].startISO, clinic.timezone)} at ${formatTime(ranked[0].startISO, clinic.timezone)} with ${ranked[0].providerName}. Confirmation ${confirmationId}.`);
          break;
        }

        const dateRange = entities.requestedDateISO ? dayRangeAround(entities.requestedDateISO, 3) : nextNDaysRange(14);
        const slots = await this.scheduler.get_available_slots(
          entities.providerId,
          entities.reasonCategory ?? "follow-up",
          dateRange,
          entities.modality ?? "in-person"
        );
        const ranked = takeTop(rankSlots(slots, entities.providerId), 3);

        if (!ranked.length) {
          say("I could not find a slot. I can add a waitlist note and connect you to the front desk.");
          disposition = "transferred";
          say(transferPrefacePrompt());
          const summary: StructuredSummary = {
            callId,
            intent,
            disposition,
            patientName: `${entities.firstName ?? ""} ${entities.lastName ?? ""}`.trim(),
            reasonCategory: entities.reasonCategory,
            notes: ["No slot found", "Requested front desk follow-up"]
          };
          transferStatus = await this.scheduler.warm_transfer(clinic.frontDeskNumber, generateHandoffSummary(summary));
          state = "S8";
          break;
        }

        selectedSlotId = ranked[0].id;
        const topText = ranked
          .map((s, idx) => `${idx + 1}) ${formatDateLong(s.startISO, clinic.timezone)} ${formatTime(s.startISO, clinic.timezone)} with ${s.providerName}`)
          .join("; ");
        say(`I found these options: ${topText}. I will book option 1 unless you prefer another.`);
        confirmationId = await this.scheduler.book_appointment(
          patientId,
          selectedSlotId,
          entities.reasonCategory ?? "follow-up",
          entities.callbackNumber ?? entities.phone ?? "",
          "Scheduling only"
        );
        disposition = "booked";
        state = "S7";
        say(`Booked. Confirmation ${confirmationId}.`);
        continue;
      }
    }

    if (state !== "S9" && state !== "S8") {
      state = "S9";
      if (disposition === "booked" || disposition === "rescheduled" || disposition === "cancelled") {
        say("Anything else I can help with today?");
      }
      say("Thank you for calling. Goodbye.");
    }

    const summary: StructuredSummary = {
      callId,
      intent,
      patientName: entities.firstName && entities.lastName ? `${entities.firstName} ${entities.lastName}` : undefined,
      verificationMethod: entities.dob ? "dob" : entities.phone ? "phone" : "none",
      reasonCategory: entities.reasonCategory,
      disposition,
      confirmationId,
      notes: [redactSensitive(`callback=${entities.callbackNumber ?? entities.phone ?? "n/a"}`), `state=${state}`]
    };

    await this.scheduler.log_call_summary(callId, summary);

    return {
      turns,
      outcome: {
        disposition,
        confirmationId,
        transferStatus,
        emergency
      },
      summary
    };
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--demo")) {
    const agent = new AlexAgent();
    const demo = await agent.runScriptedConversation("demo-1", [
      "I need an appointment",
      "Existing patient",
      "John Doe",
      "1988-02-11",
      "follow-up",
      "earliest available"
    ]);
    for (const turn of demo.turns) {
      console.log(`${turn.speaker.toUpperCase()}: ${turn.text}`);
    }
    console.log("OUTCOME", demo.outcome);
  }
}

void main();
