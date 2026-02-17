# Alex Real-Time Voice Agent (Voice In / Voice Out)

This project implements a **speaking** clinic voice assistant named **Alex**.
It is not a chat-only UI.

## What It Supports

- Streaming voice session orchestration
- OpenAI Realtime voice-to-voice mode (WebRTC) for natural conversational audio
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

Set `OPENAI_API_KEY` in `.env` for realistic voice-to-voice mode.
Set `RESEMBLE_API_KEY` and `RESEMBLE_VOICE_UUID` in `.env` if you want Resemble voice in legacy local mode.

## Local Voice Mode (Mic + Speaker)

```bash
npm run dev:local
```

Then open [http://localhost:8787](http://localhost:8787), click **Start Voice Session**, and speak.
In the UI choose `OpenAI Realtime Voice (Recommended)` for natural voice conversation.
If you choose `Legacy Local Pipeline`, set `Legacy Voice` to `Resemble TTS` for higher-quality voice than browser TTS.

Notes:
- OpenAI Realtime mode: browser uses WebRTC to OpenAI Realtime API with server-minted ephemeral session key (`POST /api/openai/realtime/session`)
- Legacy mode: browser mic streams to `/ws/local` and uses local STT/TTS simulation
- Barge-in is enabled in both modes

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

### STT

Update `createSttProvider()` in `src/voice/sttProvider.ts`:
- add a real streaming provider (Deepgram, Google, Azure, OpenAI Realtime, etc.)
- map partial/final transcripts to `SttResult`

### TTS

Update `createTtsProvider()` in `src/voice/ttsProvider.ts`:
- add low-latency streaming TTS provider
- emit PCM16 or mu-law `TtsChunk`s for Twilio transport

Keep adapter interfaces stable so `StreamSession` remains unchanged.

## OpenAI Realtime Notes

- Server endpoint: `POST /api/openai/realtime/session`
- It creates ephemeral Realtime sessions using your `OPENAI_API_KEY`.
- Browser then negotiates SDP directly with OpenAI Realtime and receives native voice output.
- Tune naturalness via `.env`:
  - `OPENAI_REALTIME_VOICE`
  - `OPENAI_REALTIME_INSTRUCTIONS`
  - `TURN_LATENCY_MIN_MS` / `TURN_LATENCY_MAX_MS` (legacy local mode)

## Resemble Voice Notes

- Server endpoint: `POST /api/resemble/synthesize`
- Requires:
  - `RESEMBLE_API_KEY`
  - `RESEMBLE_VOICE_UUID`
- Configurable endpoint:
  - `RESEMBLE_SYNTH_ENDPOINT` (default `https://f.cluster.resemble.ai/synthesize`)

## Compliance / Safety

- Alex discloses automation in greeting
- No diagnosis or treatment advice
- Emergency keywords trigger immediate emergency guidance and stop scheduling
- Logging is redacted (`DOB` / phone masking) before writing logs
