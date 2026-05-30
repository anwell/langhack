/**
 * AudioCaptureService — captures microphone audio at 16kHz with echo cancellation,
 * encodes Float32 samples to PCM16 base64, and emits encoded chunks via a callback.
 *
 * Requirements: 3.1, 5.1, 5.2
 */

export type AudioChunkCallback = (base64Pcm16: string) => void;

export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onAudioChunk: AudioChunkCallback | null = null;
  private _isCapturing = false;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  /**
   * Start capturing microphone audio.
   * @param onAudioChunk - callback invoked with base64-encoded PCM16 mono 16kHz chunks
   */
  async start(onAudioChunk: AudioChunkCallback): Promise<void> {
    if (this._isCapturing) {
      return;
    }

    this.onAudioChunk = onAudioChunk;

    // Request microphone with echo cancellation
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
        channelCount: 1,
      },
    });

    // Create 16kHz AudioContext for capture
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // ScriptProcessorNode for raw audio access (buffer size 4096, mono in, mono out)
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this._isCapturing || !this.onAudioChunk) {
        return;
      }
      const inputData = event.inputBuffer.getChannelData(0);
      const base64 = this.float32ToPcm16Base64(inputData);
      this.onAudioChunk(base64);
    };

    // Connect: mic → scriptProcessor → destination (required for processing to run)
    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);

    this._isCapturing = true;
  }

  /**
   * Stop capturing and release all resources.
   */
  stop(): void {
    this._isCapturing = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.onAudioChunk = null;
  }

  /**
   * Convert Float32 audio samples to PCM16 and encode as base64.
   */
  private float32ToPcm16Base64(float32Array: Float32Array): string {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and scale to Int16 range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    // Convert Int16Array to base64
    const bytes = new Uint8Array(pcm16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
