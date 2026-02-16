export type Modality = "in-person" | "phone" | "video";

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email?: string;
}

export interface Slot {
  id: string;
  providerId: string;
  providerName: string;
  startIso: string;
  appointmentType: string;
  modality: Modality;
}

export interface Appointment {
  id: string;
  patientId: string;
  slotId: string;
  reasonCategory: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface SchedulerApi {
  lookupPatient(name: string, dobOrPhone: string): Promise<string | null>;
  createPatient(profile: Omit<Patient, "id">): Promise<string>;
  getAvailableSlots(
    appointmentType: string,
    dateRange: DateRange,
    providerPref?: string,
    modality?: Modality
  ): Promise<Slot[]>;
  book(slotId: string, patientId: string, reasonCategory: string): Promise<string>;
  reschedule(apptId: string, newSlotId: string): Promise<string>;
  cancel(apptId: string): Promise<string>;
}

export class MockSchedulerApi implements SchedulerApi {
  private patients: Patient[] = [
    { id: "pat-100", firstName: "John", lastName: "Doe", dob: "1988-02-11", phone: "+14165550111" },
    { id: "pat-101", firstName: "Mina", lastName: "Lee", dob: "1991-06-23", phone: "+14165550112" }
  ];

  private appointments: Appointment[] = [{ id: "appt-500", patientId: "pat-100", slotId: "slot-2", reasonCategory: "follow-up" }];

  private slots: Slot[] = this.seedSlots();

  async lookupPatient(name: string, dobOrPhone: string): Promise<string | null> {
    const lowered = name.toLowerCase();
    const match = this.patients.find((p) => `${p.firstName} ${p.lastName}`.toLowerCase() === lowered && (p.dob === dobOrPhone || p.phone === dobOrPhone));
    return match?.id ?? null;
  }

  async createPatient(profile: Omit<Patient, "id">): Promise<string> {
    const id = `pat-${Math.floor(Math.random() * 9000) + 1000}`;
    this.patients.push({ id, ...profile });
    return id;
  }

  async getAvailableSlots(
    appointmentType: string,
    dateRange: DateRange,
    providerPref?: string,
    modality: Modality = "in-person"
  ): Promise<Slot[]> {
    const start = Date.parse(`${dateRange.start}T00:00:00Z`);
    const end = Date.parse(`${dateRange.end}T23:59:59Z`);

    return this.slots
      .filter((slot) => {
        const time = Date.parse(slot.startIso);
        const inRange = time >= start && time <= end;
        const providerOk = providerPref ? slot.providerName.toLowerCase() === providerPref.toLowerCase() : true;
        const typeOk = appointmentType === "new issue" ? true : slot.appointmentType === appointmentType;
        const modalityOk = slot.modality === modality;
        const booked = this.appointments.some((a) => a.slotId === slot.id);
        return inRange && providerOk && typeOk && modalityOk && !booked;
      })
      .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
  }

  async book(slotId: string, patientId: string, reasonCategory: string): Promise<string> {
    const id = `cnf-${Date.now()}`;
    this.appointments.push({ id, slotId, patientId, reasonCategory });
    return id;
  }

  async reschedule(apptId: string, newSlotId: string): Promise<string> {
    const appt = this.appointments.find((a) => a.id === apptId);
    if (!appt) throw new Error("Appointment not found");
    appt.slotId = newSlotId;
    return `rs-${Date.now()}`;
  }

  async cancel(apptId: string): Promise<string> {
    const idx = this.appointments.findIndex((a) => a.id === apptId);
    if (idx < 0) throw new Error("Appointment not found");
    this.appointments.splice(idx, 1);
    return `cx-${Date.now()}`;
  }

  private seedSlots(): Slot[] {
    const providers = [
      { id: "p1", name: "Dr. Patel" },
      { id: "p2", name: "Dr. Nguyen" },
      { id: "p3", name: "Dr. Sharma" }
    ];

    const appointmentTypes = ["annual checkup", "follow-up", "new issue", "forms", "vaccination"];
    const modalities: Modality[] = ["in-person", "phone", "video"];
    const slots: Slot[] = [];
    let n = 1;

    for (let d = 1; d <= 30; d += 1) {
      for (const provider of providers) {
        for (const modality of modalities) {
          for (const hour of [13, 14, 15]) {
            const date = new Date();
            date.setUTCDate(date.getUTCDate() + d);
            date.setUTCHours(hour, 0, 0, 0);
            slots.push({
              id: `slot-${n++}`,
              providerId: provider.id,
              providerName: provider.name,
              startIso: date.toISOString(),
              appointmentType: appointmentTypes[(n + d) % appointmentTypes.length],
              modality
            });
          }
        }
      }
    }

    return slots;
  }
}

export function createSchedulerApi(): SchedulerApi {
  return new MockSchedulerApi();
}

export function rangeNextDays(days: number): DateRange {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export function rangeAroundDay(date: string, delta: number): DateRange {
  const d = new Date(`${date}T12:00:00Z`);
  const start = new Date(d);
  const end = new Date(d);
  start.setUTCDate(start.getUTCDate() - delta);
  end.setUTCDate(end.getUTCDate() + delta);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}
