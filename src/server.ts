import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { twilioVoiceWebhook } from "./telephony/twilioWebhook.js";
import { handleTwilioMediaSocket } from "./telephony/twilioMediaWs.js";
import { StreamSession } from "./voice/streamSession.js";
import { redactObject } from "./core/redaction.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(resolve(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: process.env.APP_MODE ?? "local" });
});

app.post("/twilio/voice", twilioVoiceWebhook);

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const sessions = new Map<WebSocket, StreamSession>();

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname !== "/ws/local" && url.pathname !== "/twilio/media") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === "/twilio/media") {
      const callSid = url.searchParams.get("callSid") ?? `call-${Date.now()}`;
      void handleTwilioMediaSocket(ws, callSid);
      return;
    }

    const sessionId = `local-${Date.now()}`;
    const session = new StreamSession({
      sessionId,
      sttMode: process.env.STT_MODE ?? "local",
      ttsMode: process.env.TTS_MODE ?? "local",
      callbacks: {
        onAssistantText: (text) => {
          ws.send(JSON.stringify({ type: "assistant_text", text }));
        },
        onAssistantAudio: (codec, payloadBase64) => {
          ws.send(JSON.stringify({ type: "assistant_audio", codec, payloadBase64 }));
        },
        onTransfer: async (summary) => {
          ws.send(JSON.stringify({ type: "transfer", summary }));
        },
        onEnd: async () => {
          ws.send(JSON.stringify({ type: "end" }));
        },
        onLog: (event) => {
          logSessionEvent(event);
        }
      }
    });

    sessions.set(ws, session);
    void session.start();

    ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString()) as
        | { type: "transcript"; text: string; final?: boolean; confidence?: number }
        | { type: "audio"; pcm16: string; sampleRate?: number }
        | { type: "barge_in" };

      if (msg.type === "transcript") {
        await session.ingestTranscriptHint(msg.text, msg.final ?? true, msg.confidence ?? 0.9);
      }

      if (msg.type === "audio") {
        const frame = Buffer.from(msg.pcm16, "base64");
        await session.ingestPcm16Audio(frame, msg.sampleRate ?? 16000);
      }

      if (msg.type === "barge_in") {
        session.interruptForBargeIn();
      }
    });

    ws.on("close", () => {
      const active = sessions.get(ws);
      if (active) {
        void active.close();
      }
      sessions.delete(ws);
    });
  });
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`Alex voice server listening on http://localhost:${port}`);
  console.log(`Mode: ${process.env.APP_MODE ?? "local"}`);
});

function logSessionEvent(event: Record<string, unknown>): void {
  const logDir = resolve(process.cwd(), "logs");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const safe = redactObject(event);
  appendFileSync(resolve(logDir, "voice.log"), `${new Date().toISOString()} ${JSON.stringify(safe)}\n`);
}
