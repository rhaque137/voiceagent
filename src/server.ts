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

app.post("/api/resemble/synthesize", async (req, res) => {
  const apiKey = process.env.RESEMBLE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing RESEMBLE_API_KEY in environment." });
    return;
  }

  const endpoint = process.env.RESEMBLE_SYNTH_ENDPOINT ?? "https://p.cluster.resemble.ai/synthesize";
  const voiceUuid = process.env.RESEMBLE_VOICE_UUID ?? "fb2d2858";
  const text = String(req.body?.text ?? "").trim();

  if (!text) {
    res.status(400).json({ error: "Missing text for synthesis." });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        // Support both common auth header styles used by voice providers.
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        voice_uuid: voiceUuid,
        data: text,
        model: process.env.RESEMBLE_MODEL ?? "chatterbox-turbo",
        output_format: "wav",
        sample_rate: Number(process.env.RESEMBLE_SAMPLE_RATE ?? 24000)
      })
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("audio/")) {
      const arr = await response.arrayBuffer();
      const audioBase64 = Buffer.from(arr).toString("base64");
      if (!response.ok) {
        res.status(response.status).json({ error: "Resemble returned non-OK audio response." });
        return;
      }
      res.json({ audioBase64, format: contentType.split(";")[0] });
      return;
    }

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      res.status(response.status).json({ error: payload });
      return;
    }

    const audioBase64 =
      (payload.audio_content as string | undefined) ??
      (payload.audio as string | undefined) ??
      (payload.base64 as string | undefined);

    if (!audioBase64) {
      res.status(502).json({ error: "Resemble response missing audio payload.", raw: payload });
      return;
    }

    res.json({ audioBase64, format: "wav" });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/resemble/stream", async (req, res) => {
  const apiKey = process.env.RESEMBLE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing RESEMBLE_API_KEY in environment." });
    return;
  }

  const endpoint = process.env.RESEMBLE_STREAM_ENDPOINT ?? "https://p.cluster.resemble.ai/stream";
  const voiceUuid = process.env.RESEMBLE_VOICE_UUID ?? "fb2d2858";
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "Missing text for stream synthesis." });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        voice_uuid: voiceUuid,
        data: text,
        model: process.env.RESEMBLE_MODEL ?? "chatterbox-turbo",
        output_format: "wav",
        sample_rate: Number(process.env.RESEMBLE_SAMPLE_RATE ?? 24000)
      })
    });

    if (!response.ok || !response.body) {
      const maybeJson = await response.text();
      res.status(response.status || 502).json({ error: maybeJson || "Resemble stream request failed." });
      return;
    }

    const contentType = response.headers.get("content-type") ?? "audio/wav";
    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");

    response.body.pipeTo(
      new WritableStream({
        write(chunk) {
          res.write(Buffer.from(chunk));
        },
        close() {
          res.end();
        },
        abort(err) {
          res.destroy(err as Error);
        }
      })
    ).catch((err) => {
      res.destroy(err as Error);
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
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
