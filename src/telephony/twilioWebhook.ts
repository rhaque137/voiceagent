import type { Request, Response } from "express";

export function twilioVoiceWebhook(req: Request, res: Response): void {
  const wsBase = process.env.TWILIO_STREAM_WSS_URL;
  if (!wsBase) {
    res.status(500).type("text/plain").send("Missing TWILIO_STREAM_WSS_URL");
    return;
  }

  const callSid = String(req.body?.CallSid ?? "unknown");
  const wsUrl = `${wsBase.replace(/\/$/, "")}/twilio/media?callSid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" track="inbound_track" />
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
}
