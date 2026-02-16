export interface SttResult {
  type: "partial" | "final";
  text: string;
  confidence: number;
}

export interface SttProvider {
  pushAudio(frame: Buffer, sampleRate: number): Promise<SttResult[]>;
  pushTranscriptHint?(text: string, final: boolean): Promise<SttResult[]>;
  close(): Promise<void>;
}

export class BrowserHintSttProvider implements SttProvider {
  async pushAudio(_frame: Buffer, _sampleRate: number): Promise<SttResult[]> {
    return [];
  }

  async pushTranscriptHint(text: string, final: boolean): Promise<SttResult[]> {
    return [{ type: final ? "final" : "partial", text, confidence: 0.9 }];
  }

  async close(): Promise<void> {
    return;
  }
}

export class MockSttProvider implements SttProvider {
  async pushAudio(_frame: Buffer, _sampleRate: number): Promise<SttResult[]> {
    return [];
  }

  async pushTranscriptHint(text: string, final: boolean): Promise<SttResult[]> {
    return [{ type: final ? "final" : "partial", text, confidence: 0.75 }];
  }

  async close(): Promise<void> {
    return;
  }
}

export function createSttProvider(mode: string): SttProvider {
  if (mode === "mock") return new MockSttProvider();
  return new BrowserHintSttProvider();
}
