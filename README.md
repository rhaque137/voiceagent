# Alex Real-Time Voice Agent (Voice In / Voice Out)

This project implements a **speaking** clinic voice assistant named **Alex**.
It is not a chat-only UI.

## What It Supports

- Streaming voice session orchestration
- Resemble voice output in local legacy mode (`/stream` with `/synthesize` fallback)
- STT adapter interface (`src/voice/sttProvider.ts`) with working local transcript-hint mode + mock
- TTS adapter interface (`src/voice/ttsProvider.ts`) with working browser speech mode + mock audio mode
- Barge-in interruption while Alex is speaking
- Silence detection (6s reprompt, second silence transfer offer, third silence end)
- Appointment booking/reschedule/cancel with in-memory scheduler mock
- Twilio voice webhook + Twilio Media Streams WS architecture
- Warm transfer summary generation with redacted logging

## Project Structure

- `src/server.ts`
- `src/core/stateMachine.ts`
- `src/core/dialogPolicy.ts`
- `src/core/safety.ts`
- `src/core/validators.ts`
- `src/core/redaction.ts`
- `src/core/summary.ts`
- `src/voice/audioRouter.ts`
- `src/voice/vad.ts`
- `src/voice/sttProvider.ts`
- `src/voice/ttsProvider.ts`
- `src/voice/streamSession.ts`
- `src/telephony/twilioWebhook.ts`
- `src/telephony/twilioMediaWs.ts`
- `src/telephony/transfer.ts`
- `src/scheduler/schedulerApi.ts`
- `src/config/clinic.json`
- `public/index.html`
- `tests/voiceFlows.test.ts`

## Setup

```bash
npm install
cp .env.example .env
```

Set `RESEMBLE_API_KEY` in `.env`.

## Local Voice Mode (Mic + Speaker)

```bash
npm run dev:local
```

Then open [http://localhost:8787](http://localhost:8787), click **Start Voice Session**, and speak.
Set `Legacy Voice` to `Resemble TTS`.

Notes:
- Browser mic streams to `/ws/local`
- Resemble streaming endpoint is used first: `POST /api/resemble/stream`
- If stream fails, synth fallback is used: `POST /api/resemble/synthesize`
- Barge-in is enabled

## Twilio Phone Mode

```bash
npm run dev:twilio
```

Expose localhost with ngrok:

```bash
ngrok http 8787
```

Set env:
- `TWILIO_STREAM_WSS_URL=wss://<your-ngrok-domain>`

Configure Twilio number webhook:
- Voice webhook URL: `https://<your-ngrok-domain>/twilio/voice`
- Method: `POST`

The webhook returns TwiML with `<Connect><Stream>` to `/twilio/media`.

### Twilio Codec Notes

- Incoming media is expected as 8kHz mu-law
- `src/telephony/twilioMediaWs.ts` decodes mu-law to PCM16 for VAD/STT
- Outgoing PCM16 chunks are encoded back to mu-law for stream responses

## Tests

```bash
npm test
```

Includes required flow simulations:
- book earliest
- reschedule
- cancel
- office hours
- refill -> transfer
- emergency protocol
- barge-in event behavior

## Swapping STT/TTS Providers

### STT/TTS

Update `createSttProvider()` in `src/voice/sttProvider.ts` for alternate STT backends.
Update `createTtsProvider()` in `src/voice/ttsProvider.ts`:
- add low-latency streaming TTS provider
- emit PCM16 or mu-law `TtsChunk`s for Twilio transport

Keep adapter interfaces stable so `StreamSession` remains unchanged.

## Resemble Voice Notes

- Server endpoints:
  - `POST /api/resemble/stream`
  - `POST /api/resemble/synthesize`
- Requires:
  - `RESEMBLE_API_KEY`
  - `RESEMBLE_VOICE_UUID`
- Configurable endpoint:
  - `RESEMBLE_SYNTH_ENDPOINT` (default `https://p.cluster.resemble.ai/synthesize`)
  - `RESEMBLE_STREAM_ENDPOINT` (default `https://p.cluster.resemble.ai/stream`)

## Compliance / Safety

- Alex discloses automation in greeting
- No diagnosis or treatment advice
- Emergency keywords trigger immediate emergency guidance and stop scheduling
- Logging is redacted (`DOB` / phone masking) before writing logs
