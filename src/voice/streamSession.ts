import { DialogPolicy } from "../core/dialogPolicy.js";
import { redactSensitive } from "../core/redaction.js";
import { buildTransferSummary, type SessionSummary } from "../core/summary.js";
import { AudioRouter } from "./audioRouter.js";
import { createSttProvider, type SttProvider } from "./sttProvider.js";
import { createTtsProvider, type TtsProvider } from "./ttsProvider.js";
import { VoiceActivityDetector } from "./vad.js";

export interface SessionCallbacks {
  onAssistantText: (text: string) => void;
  onAssistantAudio?: (codec: "pcm16" | "mulaw", payloadBase64: string) => void;
  onTransfer: (summary: string) => Promise<void>;
  onEnd: () => Promise<void>;
  onLog: (event: Record<string, unknown>) => void;
}

export interface SessionOptions {
  sessionId: string;
  sttMode: string;
  ttsMode: string;
  callbacks: SessionCallbacks;
}

export class StreamSession {
  private policy = new DialogPolicy();
  private ctx;
  private stt: SttProvider;
  private tts: TtsProvider;
  private vad = new VoiceActivityDetector();
  private router = new AudioRouter();
  private callbacks: SessionCallbacks;
  private silenceTimer?: NodeJS.Timeout;
  private partialTimer?: NodeJS.Timeout;
  private pendingPartial?: { text: string; confidence: number };

  constructor(options: SessionOptions) {
    this.ctx = this.policy.createContext(options.sessionId);
    this.stt = createSttProvider(options.sttMode);
    this.tts = createTtsProvider(options.ttsMode);
    this.callbacks = options.callbacks;
    this.resetSilenceTimer();
  }

  async start(): Promise<void> {
    const first = await this.policy.handleUtterance(this.ctx, "");
    await this.speak(first.prompt);
  }

  async ingestPcm16Audio(frame: Buffer, sampleRate = 16000): Promise<void> {
    const int16 = new Int16Array(frame.buffer, frame.byteOffset, Math.floor(frame.byteLength / 2));
    const vad = this.vad.pushPcm16Frame(int16);

    if (vad.speechStarted && this.router.isSpeaking()) {
      this.handleBargeIn();
    }

    const results = await this.stt.pushAudio(frame, sampleRate);
    for (const result of results) {
      if (result.type === "final") {
        await this.handleTranscript(result.text, result.confidence);
      }
    }

    this.resetSilenceTimer();
  }

  async ingestTranscriptHint(text: string, final = true, confidence = 0.9): Promise<void> {
    const hinted = this.stt.pushTranscriptHint ? await this.stt.pushTranscriptHint(text, final) : [];
    const emitted = hinted.length ? hinted : [{ type: final ? "final" : "partial", text, confidence }];
    for (const result of emitted) {
      if (result.type === "final") {
        this.clearPartialTimer();
        await this.handleTranscript(result.text, result.confidence);
      } else {
        // Debounce partials into a natural turn-taking finalization window.
        this.pendingPartial = { text: result.text, confidence: result.confidence };
        this.clearPartialTimer();
        this.partialTimer = setTimeout(() => {
          const current = this.pendingPartial;
          this.pendingPartial = undefined;
          if (!current || !current.text.trim()) return;
          void this.handleTranscript(current.text, Math.max(0.72, current.confidence));
        }, 420);
      }
    }
    this.resetSilenceTimer();
  }

  async onSilenceTimeout(): Promise<void> {
    const response = this.policy.onSilence(this.ctx);
    await this.speak(response.prompt);
    if (response.actions.some((a) => a.type === "transfer")) {
      await this.callbacks.onTransfer(this.buildSummary("transferred"));
    }
    if (response.endCall) {
      await this.callbacks.onEnd();
    }
    this.resetSilenceTimer();
  }

  async close(): Promise<void> {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.clearPartialTimer();
    await this.stt.close();
  }

  interruptForBargeIn(): void {
    this.handleBargeIn();
  }

  private async handleTranscript(text: string, confidence: number): Promise<void> {
    this.callbacks.onLog({ type: "caller_transcript", text: redactSensitive(text), confidence });
    const res = await this.policy.handleUtterance(this.ctx, text, confidence);
    await this.speak(res.prompt);

    for (const action of res.actions) {
      if (action.type === "transfer") {
        await this.callbacks.onTransfer(this.buildSummary("transferred"));
      }
      if (action.type === "end") {
        await this.callbacks.onEnd();
      }
    }
  }

  private async speak(text: string): Promise<void> {
    await this.waitNaturalTurnLatency();
    const conversationalText = this.humanizePrompt(text);
    const chunks = await this.tts.synthesize(conversationalText);
    this.router.flush();
    this.router.holdSpeaking(Math.min(3800, Math.max(1200, conversationalText.length * 42)));
    for (const chunk of chunks) {
      this.router.enqueue({ kind: chunk.kind, payload: chunk.payload as Buffer | string });
    }

    const batch = this.router.drain(8);
    for (const chunk of batch) {
      if (chunk.kind === "text") {
        this.callbacks.onAssistantText(String(chunk.payload));
      } else {
        const payload = Buffer.isBuffer(chunk.payload) ? chunk.payload : Buffer.from(String(chunk.payload));
        this.callbacks.onAssistantAudio?.(chunk.kind, payload.toString("base64"));
      }
    }

    this.callbacks.onLog({ type: "assistant_prompt", text: redactSensitive(conversationalText) });
  }

  private handleBargeIn(): void {
    this.router.flush();
    this.callbacks.onAssistantText("[barge-in] Okay, go ahead.");
    this.callbacks.onLog({ type: "barge_in" });
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      void this.onSilenceTimeout();
    }, 6000);
  }

  private clearPartialTimer(): void {
    if (this.partialTimer) clearTimeout(this.partialTimer);
    this.partialTimer = undefined;
  }

  private async waitNaturalTurnLatency(): Promise<void> {
    // Human-like turn-taking delay target: 300-500ms.
    const rawMin = Number(process.env.TURN_LATENCY_MIN_MS ?? 300);
    const rawMax = Number(process.env.TURN_LATENCY_MAX_MS ?? 500);
    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);
    const delayMs = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private humanizePrompt(text: string): string {
    // Keep responses concise but less robotic for speech.
    return text
      .replace(/\.\s+/g, ". ")
      .replace(/\bI will\b/g, "I'll")
      .replace(/\bdo not\b/g, "don't")
      .replace(/\bcan not\b/g, "can't");
  }

  private buildSummary(disposition: SessionSummary["disposition"]): string {
    const summary: SessionSummary = {
      sessionId: this.ctx.callId,
      intent: this.ctx.fields.intent,
      patientName: this.ctx.fields.firstName && this.ctx.fields.lastName ? `${this.ctx.fields.firstName} ${this.ctx.fields.lastName}` : undefined,
      reasonCategory: this.ctx.fields.reasonCategory,
      disposition,
      notes: ["Voice session handoff"]
    };
    return buildTransferSummary(summary);
  }
}
