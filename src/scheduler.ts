import type {
  AppointmentRecord,
  ClinicInfo,
  Modality,
  PatientProfile,
  PatientRecord,
  Slot,
  StructuredSummary
} from "./types.js";
import { loadClinicConfig } from "./config.js";

export interface SchedulerAdapter {
  get_clinic_info(): Promise<ClinicInfo>;
  lookup_patient(name: string, dob_or_phone: string): Promise<string | null>;
  get_available_slots(
    provider_id: string | undefined,
    appointment_type: string,
    date_range: { start: string; end: string },
    modality: Modality
  ): Promise<Slot[]>;
  book_appointment(
    patient_id: string,
    slot_id: string,
    reason_category: string,
    callback_number: string,
    notes_limited: string
  ): Promise<string>;
  reschedule_appointment(patient_id: string, existing_appt_id: string, new_slot_id: string): Promise<string>;
  cancel_appointment(patient_id: string, appt_id: string): Promise<string>;
  create_new_patient(profile: PatientProfile): Promise<string>;
  log_call_summary(call_id: string, structured_summary: StructuredSummary): Promise<void>;
  warm_transfer(front_desk_number: string, summary_text: string): Promise<string>;
}

export class MockSchedulerAdapter implements SchedulerAdapter {
  private clinic = loadClinicConfig();

  private patients: PatientRecord[] = [
    { id: "pat-100", firstName: "John", lastName: "Doe", dob: "1988-02-11", phone: "+14165550111" },
    { id: "pat-101", firstName: "Mina", lastName: "Lee", dob: "1991-06-23", phone: "+14165550112" }
  ];

  private appointments: AppointmentRecord[] = [
    { id: "appt-500", patientId: "pat-100", slotId: "slot-1", reasonCategory: "follow-up", callbackNumber: "+14165550111" }
  ];

  private slots: Slot[] = this.seedSlots();

  async get_clinic_info(): Promise<ClinicInfo> {
    return this.clinic;
  }

  async lookup_patient(name: string, dob_or_phone: string): Promise<string | null> {
    const lowered = name.toLowerCase();
    const patient = this.patients.find((p) => {
      const sameName = `${p.firstName} ${p.lastName}`.toLowerCase() === lowered;
      const sameSecondary = p.dob === dob_or_phone || p.phone === dob_or_phone;
      return sameName && sameSecondary;
    });
    return patient?.id ?? null;
  }

  async get_available_slots(
    provider_id: string | undefined,
    appointment_type: string,
    date_range: { start: string; end: string },
    modality: Modality
  ): Promise<Slot[]> {
    const startTs = new Date(`${date_range.start}T00:00:00Z`).getTime();
    const endTs = new Date(`${date_range.end}T23:59:59Z`).getTime();

    return this.slots.filter((slot) => {
      const t = new Date(slot.startISO).getTime();
      const inRange = t >= startTs && t <= endTs;
      const providerMatch = provider_id ? slot.providerId === provider_id : true;
      const modalityMatch = slot.modality === modality;
      const typeMatch = slot.appointmentType === appointment_type || appointment_type === "new issue";
      const alreadyBooked = this.appointments.some((a) => a.slotId === slot.id);
      return inRange && providerMatch && modalityMatch && typeMatch && !alreadyBooked;
    });
  }

  async book_appointment(
    patient_id: string,
    slot_id: string,
    reason_category: string,
    callback_number: string,
    notes_limited: string
  ): Promise<string> {
    const id = `cnf-${Date.now()}`;
    this.appointments.push({ id, patientId: patient_id, slotId: slot_id, reasonCategory: reason_category, callbackNumber: callback_number });
    void notes_limited;
    return id;
  }

  async reschedule_appointment(patient_id: string, existing_appt_id: string, new_slot_id: string): Promise<string> {
    const appt = this.appointments.find((a) => a.id === existing_appt_id && a.patientId === patient_id);
    if (!appt) throw new Error("Appointment not found");
    appt.slotId = new_slot_id;
    return `rs-${Date.now()}`;
  }

  async cancel_appointment(patient_id: string, appt_id: string): Promise<string> {
    const index = this.appointments.findIndex((a) => a.id === appt_id && a.patientId === patient_id);
    if (index < 0) throw new Error("Appointment not found");
    this.appointments.splice(index, 1);
    return `cx-${Date.now()}`;
  }

  async create_new_patient(profile: PatientProfile): Promise<string> {
    const id = `pat-${Math.floor(Math.random() * 9000 + 1000)}`;
    this.patients.push({ id, ...profile });
    return id;
  }

  async log_call_summary(_call_id: string, _structured_summary: StructuredSummary): Promise<void> {
    return;
  }

  async warm_transfer(front_desk_number: string, _summary_text: string): Promise<string> {
    return `transferred:${front_desk_number}`;
  }

  private seedSlots(): Slot[] {
    const providers = this.clinic.providers;
    const modalities: Modality[] = ["in-person", "phone", "video"];
    const result: Slot[] = [];
    let counter = 1;

    for (let d = 1; d <= 21; d += 1) {
      for (const provider of providers) {
        for (const modality of modalities) {
          const day = new Date();
          day.setDate(day.getDate() + d);
          day.setHours(14, 0, 0, 0);
          result.push({
            id: `slot-${counter++}`,
            providerId: provider.id,
            providerName: provider.name,
            startISO: new Date(day).toISOString(),
            modality,
            appointmentType: "follow-up"
          });
          day.setHours(15, 0, 0, 0);
          result.push({
            id: `slot-${counter++}`,
            providerId: provider.id,
            providerName: provider.name,
            startISO: new Date(day).toISOString(),
            modality,
            appointmentType: "annual checkup"
          });
          day.setHours(16, 0, 0, 0);
          result.push({
            id: `slot-${counter++}`,
            providerId: provider.id,
            providerName: provider.name,
            startISO: new Date(day).toISOString(),
            modality,
            appointmentType: "new issue"
          });
        }
      }
    }

    return result;
  }
}

export function createSchedulerAdapter(): SchedulerAdapter {
  return new MockSchedulerAdapter();
}
