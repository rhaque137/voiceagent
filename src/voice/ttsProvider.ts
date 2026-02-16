export interface TtsChunk {
  kind: "text" | "pcm16" | "mulaw";
  payload: Buffer | string;
}

export interface TtsProvider {
  synthesize(text: string): Promise<TtsChunk[]>;
}

export class BrowserSpeechTtsProvider implements TtsProvider {
  async synthesize(text: string): Promise<TtsChunk[]> {
    // Browser client speaks returned text with SpeechSynthesis for low setup local demo.
    return [{ kind: "text", payload: text }];
  }
}

export class MockTtsProvider implements TtsProvider {
  async synthesize(text: string): Promise<TtsChunk[]> {
    const sampleRate = 8000;
    const durationSeconds = Math.min(3, Math.max(1, Math.ceil(text.length / 35)));
    const totalSamples = sampleRate * durationSeconds;
    const pcm = Buffer.alloc(totalSamples * 2);
    const frequency = 220;

    for (let i = 0; i < totalSamples; i += 1) {
      const t = i / sampleRate;
      const sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * 5000);
      pcm.writeInt16LE(sample, i * 2);
    }

    return [{ kind: "pcm16", payload: pcm }];
  }
}

export function createTtsProvider(mode: string): TtsProvider {
  if (mode === "mock") return new MockTtsProvider();
  return new BrowserSpeechTtsProvider();
}
