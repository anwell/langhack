/**
 * AudioPlaybackService — plays AI audio responses at 24kHz using an AudioWorklet
 * with a ring buffer. Supports barge-in (instant buffer clear).
 *
 * Requirements: 3.3, 3.7, 5.5
 */

export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private fallbackNode: ScriptProcessorNode | null = null;
  private fallbackBuffer: Float32Array = new Float32Array(24000 * 60);
  private fallbackWritePos = 0;
  private fallbackReadPos = 0;
  private _isPlaying = false;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Initialize the 24kHz AudioContext and load the AudioWorklet processor.
   */
  async start(): Promise<void> {
    if (this._isPlaying) {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error('Audio playback is not supported in this browser.');
    }

    // Create 24kHz AudioContext for playback
    const audioContext = new AudioContextConstructor({ sampleRate: 24000 });
    this.audioContext = audioContext;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    try {
      if (!audioContext.audioWorklet || !window.AudioWorkletNode) {
        throw new Error('AudioWorklet playback is not supported in this browser.');
      }
      await audioContext.audioWorklet.addModule('/audio-player-processor.js');
      this.workletNode = new window.AudioWorkletNode(audioContext, 'audio-player-processor');
      this.workletNode.connect(audioContext.destination);
    } catch {
      this.startFallbackPlayback(audioContext);
    }

    this._isPlaying = true;
  }

  /**
   * Enqueue base64-encoded PCM16 audio data into the ring buffer for playback.
   * @param base64Pcm16 - base64-encoded PCM16 mono 24kHz audio
   */
  enqueueAudio(base64Pcm16: string): void {
    if ((!this.workletNode && !this.fallbackNode) || !this._isPlaying) {
      return;
    }

    const samples = this.pcm16Base64ToFloat32(base64Pcm16);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'audio', samples });
    } else if (this.fallbackNode) {
      this.enqueueFallback(samples);
    }
  }

  /**
   * Clear the playback buffer instantly (barge-in support).
   * Called when the user interrupts the AI's response.
   */
  clearBuffer(): void {
    if (!this.workletNode && !this.fallbackNode) {
      return;
    }

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'barge-in' });
    }
    this.fallbackReadPos = this.fallbackWritePos;
  }

  /**
   * Stop playback and release all resources.
   */
  stop(): void {
    this._isPlaying = false;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.fallbackNode) {
      this.fallbackNode.disconnect();
      this.fallbackNode.onaudioprocess = null;
      this.fallbackNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Decode base64 PCM16 data to Float32 samples for the AudioWorklet.
   */
  private pcm16Base64ToFloat32(base64: string): Float32Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }

    return float32;
  }

  private startFallbackPlayback(audioContext: AudioContext): void {
    this.fallbackReadPos = 0;
    this.fallbackWritePos = 0;
    this.fallbackBuffer.fill(0);

    const node = audioContext.createScriptProcessor(4096, 0, 1);
    node.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0);
      for (let i = 0; i < output.length; i++) {
        if (this.fallbackReadPos < this.fallbackWritePos) {
          output[i] = this.fallbackBuffer[this.fallbackReadPos % this.fallbackBuffer.length];
          this.fallbackReadPos++;
        } else {
          output[i] = 0;
        }
      }
    };
    node.connect(audioContext.destination);
    this.fallbackNode = node;
  }

  private enqueueFallback(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.fallbackBuffer[this.fallbackWritePos % this.fallbackBuffer.length] = samples[i];
      this.fallbackWritePos++;
    }
  }
}
