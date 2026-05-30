/**
 * WebSocketService — manages the WebSocket connection to the backend /ws endpoint.
 * Handles message routing: audio → playback, transcript → event, barge-in → clear buffer,
 * session_ended → close.
 *
 * Requirements: 3.1, 3.3, 3.7, 5.1, 5.2, 5.5
 */

import { TranscriptEntry } from '../types';
import { AudioCaptureService } from './AudioCaptureService';
import { AudioPlaybackService } from './AudioPlaybackService';

/** Events emitted by the WebSocket service */
export interface WebSocketEventHandlers {
  onTranscript?: (entry: {
    role: 'user' | 'assistant';
    text: string;
    english_translation?: string;
    is_final: boolean;
  }) => void;
  onSessionEnded?: (transcript: TranscriptEntry[]) => void;
  onError?: (error: Error) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionConfig {
  scenario_context: string;
  target_language: string;
  scenario_id: string;
  show_english_translations?: boolean;
}

const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

export class WebSocketService {
  private ws: WebSocket | null = null;
  private audioCaptureService: AudioCaptureService;
  private audioPlaybackService: AudioPlaybackService;
  private eventHandlers: WebSocketEventHandlers = {};
  private _connectionState: ConnectionState = 'disconnected';
  private wsUrl: string;
  private retryCount = 0;
  private sessionConfig: SessionConfig | null = null;

  constructor(wsUrl: string = DEFAULT_WS_URL) {
    this.wsUrl = wsUrl;
    this.audioCaptureService = new AudioCaptureService();
    this.audioPlaybackService = new AudioPlaybackService();
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Register event handlers for WebSocket events.
   */
  setEventHandlers(handlers: WebSocketEventHandlers): void {
    this.eventHandlers = handlers;
  }

  /**
   * Connect to the backend WebSocket and start a voice session.
   * Sends the initial session config, then starts audio capture and playback.
   */
  async connect(config: SessionConfig): Promise<void> {
    this.sessionConfig = config;
    this.retryCount = 0;
    await this.attemptConnection();
  }

  /**
   * Disconnect from the WebSocket and stop all audio services.
   */
  disconnect(): void {
    this.stopAudio();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState('disconnected');
    this.sessionConfig = null;
    this.retryCount = 0;
  }

  private async attemptConnection(): Promise<void> {
    this.setConnectionState('connecting');

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = async () => {
          this.setConnectionState('connected');
          this.retryCount = 0;

          // Send initial session config
          if (this.ws && this.sessionConfig) {
            this.ws.send(JSON.stringify(this.sessionConfig));
          }

          // Start audio services
          try {
            await this.startAudio();
            resolve();
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.eventHandlers.onError?.(error);
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (_event: Event) => {
          const error = new Error('WebSocket connection error');
          this.handleConnectionError(error, reject);
        };

        this.ws.onclose = (_event) => {
          if (this._connectionState === 'connected') {
            // Unexpected close — connection was lost
            this.stopAudio();
            this.setConnectionState('disconnected');
            this.eventHandlers.onError?.(new Error('WebSocket connection lost'));
          }
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.handleConnectionError(error, reject);
      }
    });
  }

  private async handleConnectionError(
    error: Error,
    reject: (reason: Error) => void
  ): Promise<void> {
    if (this.retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[this.retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      this.retryCount++;

      await new Promise((r) => setTimeout(r, delay));

      try {
        await this.attemptConnection();
      } catch (retryError) {
        reject(retryError instanceof Error ? retryError : new Error(String(retryError)));
      }
    } else {
      this.setConnectionState('error');
      this.eventHandlers.onError?.(error);
      reject(error);
    }
  }

  private handleMessage(event: { data?: unknown }): void {
    let message: { type: string; [key: string]: unknown };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      // Ignore malformed messages
      return;
    }

    switch (message.type) {
      case 'audio':
        // Enqueue audio data to the playback ring buffer
        if (typeof message.data === 'string') {
          this.audioPlaybackService.enqueueAudio(message.data);
        }
        break;

      case 'transcript':
        // Emit transcript event
        this.eventHandlers.onTranscript?.({
          role: message.role as 'user' | 'assistant',
          text: message.text as string,
          english_translation:
            typeof message.english_translation === 'string'
              ? message.english_translation
              : undefined,
          is_final: message.is_final as boolean,
        });
        break;

      case 'barge-in':
        // Clear the playback buffer immediately
        this.audioPlaybackService.clearBuffer();
        break;

      case 'session_ended':
        // Session ended by server — stop audio and emit event
        this.stopAudio();
        this.eventHandlers.onSessionEnded?.(
          (message.transcript as TranscriptEntry[]) || []
        );
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this.setConnectionState('disconnected');
        break;

      case 'error': {
        // Backend reported a real startup/streaming error. Surface that message
        // instead of waiting for the socket close handler to show a generic
        // "connection lost" error.
        this.stopAudio();
        const errorMessage =
          typeof message.message === 'string'
            ? message.message
            : 'Voice session failed. Please check backend configuration.';
        this.setConnectionState('error');
        this.eventHandlers.onError?.(new Error(errorMessage));
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        break;
      }

      default:
        // Unknown message type — ignore gracefully
        break;
    }
  }

  private async startAudio(): Promise<void> {
    // Start playback first (AudioWorklet setup)
    await this.audioPlaybackService.start();

    // Start capture — sends audio chunks over WebSocket
    await this.audioCaptureService.start((base64Pcm16: string) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'audio', data: base64Pcm16 }));
      }
    });
  }

  private stopAudio(): void {
    this.audioCaptureService.stop();
    this.audioPlaybackService.stop();
  }

  private setConnectionState(state: ConnectionState): void {
    this._connectionState = state;
    this.eventHandlers.onConnectionStateChange?.(state);
  }
}
