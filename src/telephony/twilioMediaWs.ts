import type { WebSocket } from "ws";
import { StreamSession } from "../voice/streamSession.js";

interface TwilioMediaEvent {
  event: "connected" | "start" | "media" | "stop";
  streamSid?: string;
  media?: { payload: string; track?: string; chunk?: string; timestamp?: string };
  start?: { callSid?: string; streamSid?: string };
}

function muLawToPcm16(muLaw: Uint8Array): Buffer {
  const out = Buffer.alloc(muLaw.length * 2);
  for (let i = 0; i < muLaw.length; i += 1) {
    out.writeInt16LE(decodeMuLaw(muLaw[i]), i * 2);
  }
  return out;
}

function pcm16ToMuLaw(pcm: Buffer): Buffer {
  const len = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = encodeMuLaw(pcm.readInt16LE(i * 2));
  }
  return out;
}

function decodeMuLaw(uVal: number): number {
  const MULAW_BIAS = 33;
  uVal = ~uVal;
  const sign = uVal & 0x80;
  const exponent = (uVal >> 4) & 0x07;
  const mantissa = uVal & 0x0f;
  let sample = ((mantissa << 4) + 0x08) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

function encodeMuLaw(sample: number): number {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  sample = Math.min(sample, MULAW_MAX) + MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent -= 1) {
    expMask >>= 1;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export async function handleTwilioMediaSocket(ws: WebSocket, callSid: string): Promise<void> {
  let streamSid = "";

  const session = new StreamSession({
    sessionId: callSid,
    sttMode: process.env.STT_MODE ?? "mock",
    ttsMode: process.env.TTS_MODE ?? "mock",
    callbacks: {
      onAssistantText: (text) => {
        // For Twilio media mode we mostly send audio frames, but keep text logs for traceability.
        console.log("[alex]", text);
      },
      onAssistantAudio: (codec, payloadBase64) => {
        if (!streamSid) return;
        const payload = Buffer.from(payloadBase64, "base64");
        const mulaw = codec === "mulaw" ? payload : pcm16ToMuLaw(payload);
        const mediaMsg = {
          event: "media",
          streamSid,
          media: { payload: mulaw.toString("base64") }
        };
        ws.send(JSON.stringify(mediaMsg));
      },
      onTransfer: async (summary) => {
        console.log("[transfer-summary]", summary);
      },
      onEnd: async () => {
        ws.close();
      },
      onLog: (event) => {
        console.log("[session-log]", event);
      }
    }
  });

  await session.start();

  ws.on("message", async (raw) => {
    const data = JSON.parse(raw.toString()) as TwilioMediaEvent;

    if (data.event === "start") {
      streamSid = data.start?.streamSid ?? data.streamSid ?? "";
      return;
    }

    if (data.event === "media" && data.media?.payload) {
      const muLaw = Buffer.from(data.media.payload, "base64");
      const pcm16 = muLawToPcm16(muLaw);
      await session.ingestPcm16Audio(pcm16, 8000);
      return;
    }

    if (data.event === "stop") {
      await session.close();
      ws.close();
    }
  });

  ws.on("close", () => {
    void session.close();
  });
}
