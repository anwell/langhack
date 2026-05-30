/**
 * AudioWorklet processor for playback of AI audio responses.
 * Uses a 60-second ring buffer at 24kHz to absorb faster-than-realtime bursts.
 * Supports barge-in by instantly clearing the buffer (readPos = writePos).
 */
class AudioPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 24000 * 60; // 60 seconds at 24kHz
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
    this._readPos = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        this._enqueue(event.data.samples);
      } else if (event.data.type === 'barge-in') {
        // Instantly clear playback buffer on interruption
        this._readPos = this._writePos;
      }
    };
  }

  _enqueue(samples) {
    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._writePos % this._bufferSize] = samples[i];
      this._writePos++;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      if (this._readPos < this._writePos) {
        output[i] = this._buffer[this._readPos % this._bufferSize];
        this._readPos++;
      } else {
        output[i] = 0; // Silence when buffer is empty
      }
    }
    return true;
  }
}

registerProcessor('audio-player-processor', AudioPlayerProcessor);
