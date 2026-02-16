export interface OutboundAudioChunk {
  kind: "pcm16" | "mulaw" | "text";
  payload: Buffer | string;
}

export class AudioRouter {
  private queue: OutboundAudioChunk[] = [];
  private speaking = false;
  private speakingTimer?: NodeJS.Timeout;

  enqueue(chunk: OutboundAudioChunk): void {
    this.queue.push(chunk);
    this.speaking = true;
  }

  drain(max = 4): OutboundAudioChunk[] {
    const chunks = this.queue.splice(0, max);
    if (this.queue.length === 0 && !this.speakingTimer) this.speaking = false;
    return chunks;
  }

  flush(): void {
    this.queue = [];
    this.speaking = false;
    if (this.speakingTimer) clearTimeout(this.speakingTimer);
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  holdSpeaking(ms: number): void {
    this.speaking = true;
    if (this.speakingTimer) clearTimeout(this.speakingTimer);
    this.speakingTimer = setTimeout(() => {
      this.speaking = false;
      this.speakingTimer = undefined;
    }, ms);
  }
}
