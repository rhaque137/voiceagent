import { describe, expect, it } from "vitest";
import { AlexAgent } from "../src/agent.js";

describe("Alex voice agent scripted conversations", () => {
  it("1) existing patient booking earliest available", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c1", [
      "Book me an appointment",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "follow-up",
      "earliest available"
    ]);

    expect(res.outcome.disposition).toBe("booked");
    expect(res.summary.verificationMethod).toBe("dob");
  });

  it("2) new patient booking with provider preference", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c2", [
      "I am a new patient and need an appointment",
      "new patient",
      "Sara Khan",
      "1995-04-20",
      "6475552222",
      "new issue with Dr. Nguyen",
      "earliest available"
    ]);

    expect(res.outcome.disposition).toBe("booked");
    expect(res.summary.patientName).toBe("Sara Khan");
  });

  it("3) reschedule existing appointment", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c3", [
      "I need to reschedule",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "appt-500",
      "2026-03-12"
    ]);

    expect(res.outcome.disposition).toBe("rescheduled");
    expect(res.outcome.confirmationId).toMatch(/^rs-/);
  });

  it("4) cancel appointment", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c4", [
      "cancel my appointment",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "appt-500"
    ]);

    expect(res.outcome.disposition).toBe("cancelled");
    expect(res.outcome.confirmationId).toMatch(/^cx-/);
  });

  it("5) office hours and address request", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c5", ["what are your hours and address?"]);

    expect(res.outcome.disposition).toBe("info_only");
    expect(res.turns.some((t) => t.speaker === "alex" && /Health Ave/.test(t.text))).toBe(true);
  });

  it("6) prescription refill transfers to front desk", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c6", ["I need a prescription refill"]);

    expect(res.outcome.disposition).toBe("transferred");
    expect(res.outcome.transferStatus).toContain("transferred");
  });

  it("7) low ASR confidence then recovery transfer", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c7", ["mumble", "unclear audio"]);

    expect(res.outcome.disposition).toBe("transferred");
    expect(res.turns.some((t) => t.speaker === "alex" && /did you say that again/i.test(t.text))).toBe(true);
  });

  it("8) emergency symptom mention triggers emergency protocol", async () => {
    const agent = new AlexAgent();
    const res = await agent.runScriptedConversation("c8", ["I have chest pain and severe shortness of breath"]);

    expect(res.outcome.disposition).toBe("emergency_redirect");
    expect(res.outcome.emergency).toBe(true);
    expect(res.turns.some((t) => t.speaker === "alex" && /call 911/i.test(t.text))).toBe(true);
  });
});
