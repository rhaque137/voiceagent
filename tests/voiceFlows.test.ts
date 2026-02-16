import { describe, expect, it } from "vitest";
import { DialogPolicy } from "../src/core/dialogPolicy.js";
import { StreamSession } from "../src/voice/streamSession.js";

async function runFlow(turns: string[]): Promise<{ prompts: string[]; actions: string[] }> {
  const policy = new DialogPolicy();
  const ctx = policy.createContext(`test-${Date.now()}`);
  const prompts: string[] = [];
  const actions: string[] = [];

  const first = await policy.handleUtterance(ctx, "");
  prompts.push(first.prompt);
  first.actions.forEach((a) => actions.push(a.type));

  for (const turn of turns) {
    const res = await policy.handleUtterance(ctx, turn);
    prompts.push(res.prompt);
    res.actions.forEach((a) => actions.push(a.type));
  }

  return { prompts, actions };
}

describe("voice dialog flows", () => {
  it("book earliest", async () => {
    const out = await runFlow([
      "book appointment",
      "no urgent symptoms",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "follow-up",
      "earliest available"
    ]);

    expect(out.actions).toContain("book");
  });

  it("reschedule", async () => {
    const out = await runFlow([
      "reschedule appointment",
      "no urgent symptoms",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "appt-500",
      "2026-03-15"
    ]);

    expect(out.actions).toContain("reschedule");
  });

  it("cancel", async () => {
    const out = await runFlow([
      "cancel appointment",
      "no urgent symptoms",
      "existing patient",
      "John Doe",
      "1988-02-11",
      "appt-500"
    ]);

    expect(out.actions).toContain("cancel");
  });

  it("office hours", async () => {
    const out = await runFlow(["what are your hours and address"]);
    expect(out.prompts.join(" ")).toMatch(/address/i);
  });

  it("prescription refill transfers", async () => {
    const out = await runFlow(["I need a prescription refill"]);
    expect(out.actions).toContain("transfer");
  });

  it("emergency symptom protocol", async () => {
    const out = await runFlow(["I have chest pain"]);
    expect(out.prompts.join(" ")).toMatch(/call 911/i);
    expect(out.actions).toContain("end");
  });

  it("barge-in behavior", async () => {
    const events: Array<Record<string, unknown>> = [];
    const texts: string[] = [];

    const session = new StreamSession({
      sessionId: "barge-test",
      sttMode: "local",
      ttsMode: "local",
      callbacks: {
        onAssistantText: (text) => texts.push(text),
        onTransfer: async () => {
          return;
        },
        onEnd: async () => {
          return;
        },
        onLog: (event) => events.push(event)
      }
    });

    await session.start();

    const loudFrame = Buffer.alloc(320 * 2);
    for (let i = 0; i < loudFrame.length; i += 2) {
      loudFrame.writeInt16LE(15000, i);
    }

    await session.ingestPcm16Audio(loudFrame, 16000);
    await session.ingestPcm16Audio(loudFrame, 16000);
    await session.ingestPcm16Audio(loudFrame, 16000);
    await session.ingestPcm16Audio(loudFrame, 16000);

    expect(texts.some((t) => t.includes("[barge-in]"))).toBe(true);
    expect(events.some((e) => e.type === "barge_in")).toBe(true);

    await session.close();
  });
});
