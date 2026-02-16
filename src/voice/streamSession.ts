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
        await this.handleTranscript(result.text, result.confidence);
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
    await this.stt.close();
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
    const chunks = await this.tts.synthesize(text);
    this.router.flush();
    this.router.holdSpeaking(Math.min(3000, Math.max(900, text.length * 35)));
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

    this.callbacks.onLog({ type: "assistant_prompt", text: redactSensitive(text) });
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
