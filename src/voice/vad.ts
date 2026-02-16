export interface VadConfig {
  speechThreshold: number;
  minSpeechFrames: number;
}

export interface VadResult {
  speechDetected: boolean;
  speechStarted: boolean;
}

export class VoiceActivityDetector {
  private config: VadConfig;
  private speechFrames = 0;
  private speaking = false;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = {
      speechThreshold: config.speechThreshold ?? 800,
      minSpeechFrames: config.minSpeechFrames ?? 3
    };
  }

  pushPcm16Frame(frame: Int16Array): VadResult {
    const energy = this.rms(frame);
    if (energy >= this.config.speechThreshold) {
      this.speechFrames += 1;
    } else {
      this.speechFrames = Math.max(0, this.speechFrames - 1);
    }

    const wasSpeaking = this.speaking;
    this.speaking = this.speechFrames >= this.config.minSpeechFrames;

    return {
      speechDetected: this.speaking,
      speechStarted: !wasSpeaking && this.speaking
    };
  }

  private rms(frame: Int16Array): number {
    if (frame.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const v = frame[i];
      sum += v * v;
    }
    return Math.sqrt(sum / frame.length);
  }
}
