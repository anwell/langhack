/**
 * AudioPlaybackService — plays AI audio responses at 24kHz using an AudioWorklet
 * with a ring buffer. Supports barge-in (instant buffer clear).
 *
 * Requirements: 3.3, 3.7, 5.5
 */

export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
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

    // Create 24kHz AudioContext for playback
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    // Load the AudioWorklet processor module
    await this.audioContext.audioWorklet.addModule(
      new URL('./audio-player-processor.js', import.meta.url).href
    );

    // Create the worklet node and connect to output
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-player-processor');
    this.workletNode.connect(this.audioContext.destination);

    this._isPlaying = true;
  }

  /**
   * Enqueue base64-encoded PCM16 audio data into the ring buffer for playback.
   * @param base64Pcm16 - base64-encoded PCM16 mono 24kHz audio
   */
  enqueueAudio(base64Pcm16: string): void {
    if (!this.workletNode || !this._isPlaying) {
      return;
    }

    const samples = this.pcm16Base64ToFloat32(base64Pcm16);
    this.workletNode.port.postMessage({ type: 'audio', samples });
  }

  /**
   * Clear the playback buffer instantly (barge-in support).
   * Called when the user interrupts the AI's response.
   */
  clearBuffer(): void {
    if (!this.workletNode || !this._isPlaying) {
      return;
    }

    this.workletNode.port.postMessage({ type: 'barge-in' });
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
}
