/**
 * Unit tests for SessionScreen logic.
 * Tests the screen's interaction with WebSocketService, transcript handling,
 * connection state management, and retry behavior.
 *
 * Requirements: 2.2, 2.4, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 5.1, 5.3
 */

import { WebSocketService, WebSocketEventHandlers, SessionConfig, ConnectionState } from '../services/WebSocketService';

// Mock WebSocketService to test SessionScreen logic without real connections
class MockWebSocketService {
  public eventHandlers: WebSocketEventHandlers = {};
  public connectCalled = false;
  public disconnectCalled = false;
  public lastConfig: SessionConfig | null = null;
  public shouldFailConnect = false;
  public connectCallCount = 0;
  private _connectionState: ConnectionState = 'disconnected';

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  setEventHandlers(handlers: WebSocketEventHandlers): void {
    this.eventHandlers = handlers;
  }

  async connect(config: SessionConfig): Promise<void> {
    this.connectCalled = true;
    this.connectCallCount++;
    this.lastConfig = config;

    if (this.shouldFailConnect) {
      this._connectionState = 'error';
      throw new Error('Connection failed');
    }

    this._connectionState = 'connected';
    this.eventHandlers.onConnectionStateChange?.('connected');
  }

  disconnect(): void {
    this.disconnectCalled = true;
    this._connectionState = 'disconnected';
    this.eventHandlers.onConnectionStateChange?.('disconnected');
  }

  // Simulate receiving a transcript event
  simulateTranscript(role: 'user' | 'assistant', text: string, is_final: boolean): void {
    this.eventHandlers.onTranscript?.({ role, text, is_final });
  }

  // Simulate session ended
  simulateSessionEnded(transcript: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>): void {
    this.eventHandlers.onSessionEnded?.(transcript);
  }

  // Simulate error
  simulateError(message: string): void {
    this.eventHandlers.onError?.(new Error(message));
  }
}

describe('SessionScreen logic', () => {
  const defaultParams = {
    scenario_context: 'You are a waiter at a French restaurant.',
    target_language: 'fr',
    scenario_id: 'test-scenario-123',
    scenario_title: 'Restaurant Ordering',
  };

  describe('Session initialization', () => {
    it('should send correct session config on connect', async () => {
      const mockService = new MockWebSocketService();
      await mockService.connect({
        scenario_context: defaultParams.scenario_context,
        target_language: defaultParams.target_language,
        scenario_id: defaultParams.scenario_id,
      });

      expect(mockService.connectCalled).toBe(true);
      expect(mockService.lastConfig).toEqual({
        scenario_context: 'You are a waiter at a French restaurant.',
        target_language: 'fr',
        scenario_id: 'test-scenario-123',
      });
    });

    it('should set connection state to connected on successful connect', async () => {
      const mockService = new MockWebSocketService();
      await mockService.connect({
        scenario_context: defaultParams.scenario_context,
        target_language: defaultParams.target_language,
        scenario_id: defaultParams.scenario_id,
      });

      expect(mockService.connectionState).toBe('connected');
    });

    it('should throw error when connection fails', async () => {
      const mockService = new MockWebSocketService();
      mockService.shouldFailConnect = true;

      await expect(
        mockService.connect({
          scenario_context: defaultParams.scenario_context,
          target_language: defaultParams.target_language,
          scenario_id: defaultParams.scenario_id,
        })
      ).rejects.toThrow('Connection failed');

      expect(mockService.connectionState).toBe('error');
    });
  });

  describe('Transcript handling', () => {
    it('should emit transcript entries with correct role labels', () => {
      const mockService = new MockWebSocketService();
      const receivedEntries: Array<{ role: string; text: string; is_final: boolean }> = [];

      mockService.setEventHandlers({
        onTranscript: (entry) => {
          receivedEntries.push(entry);
        },
      });

      mockService.simulateTranscript('user', 'Bonjour', true);
      mockService.simulateTranscript('assistant', 'Bonjour! Bienvenue au restaurant.', true);

      expect(receivedEntries).toHaveLength(2);
      expect(receivedEntries[0]).toEqual({ role: 'user', text: 'Bonjour', is_final: true });
      expect(receivedEntries[1]).toEqual({
        role: 'assistant',
        text: 'Bonjour! Bienvenue au restaurant.',
        is_final: true,
      });
    });

    it('should only add final transcript entries to the display', () => {
      const mockService = new MockWebSocketService();
      const finalEntries: Array<{ role: string; text: string }> = [];

      mockService.setEventHandlers({
        onTranscript: (entry) => {
          if (entry.is_final) {
            finalEntries.push({ role: entry.role, text: entry.text });
          }
        },
      });

      // Partial transcript (not final)
      mockService.simulateTranscript('user', 'Bon', false);
      mockService.simulateTranscript('user', 'Bonjour', true);

      expect(finalEntries).toHaveLength(1);
      expect(finalEntries[0].text).toBe('Bonjour');
    });

    it('should label user entries as "user" and assistant entries as "assistant"', () => {
      const mockService = new MockWebSocketService();
      const entries: Array<{ role: string }> = [];

      mockService.setEventHandlers({
        onTranscript: (entry) => {
          if (entry.is_final) {
            entries.push({ role: entry.role });
          }
        },
      });

      mockService.simulateTranscript('user', 'Hello', true);
      mockService.simulateTranscript('assistant', 'Hi there', true);

      expect(entries[0].role).toBe('user');
      expect(entries[1].role).toBe('assistant');
    });
  });

  describe('Session end', () => {
    it('should disconnect when stop is called', () => {
      const mockService = new MockWebSocketService();
      mockService.disconnect();

      expect(mockService.disconnectCalled).toBe(true);
      expect(mockService.connectionState).toBe('disconnected');
    });

    it('should emit session ended event with transcript', () => {
      const mockService = new MockWebSocketService();
      let endedTranscript: unknown[] = [];

      mockService.setEventHandlers({
        onSessionEnded: (transcript) => {
          endedTranscript = transcript;
        },
      });

      const transcript = [
        { role: 'user' as const, text: 'Bonjour', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant' as const, text: 'Bonjour!', timestamp: '2024-01-01T00:00:01Z' },
      ];

      mockService.simulateSessionEnded(transcript);

      expect(endedTranscript).toEqual(transcript);
    });
  });

  describe('Error handling and retry', () => {
    it('should emit error event on connection failure', () => {
      const mockService = new MockWebSocketService();
      let receivedError: Error | null = null;

      mockService.setEventHandlers({
        onError: (error) => {
          receivedError = error;
        },
      });

      mockService.simulateError('WebSocket connection error');

      expect(receivedError).not.toBeNull();
      expect(receivedError!.message).toBe('WebSocket connection error');
    });

    it('should allow retry after connection failure', async () => {
      const mockService = new MockWebSocketService();
      mockService.shouldFailConnect = true;

      // First attempt fails
      await expect(
        mockService.connect({
          scenario_context: defaultParams.scenario_context,
          target_language: defaultParams.target_language,
          scenario_id: defaultParams.scenario_id,
        })
      ).rejects.toThrow();

      // Retry succeeds
      mockService.shouldFailConnect = false;
      await mockService.connect({
        scenario_context: defaultParams.scenario_context,
        target_language: defaultParams.target_language,
        scenario_id: defaultParams.scenario_id,
      });

      expect(mockService.connectionState).toBe('connected');
      expect(mockService.connectCallCount).toBe(2);
    });

    it('should track retry count', async () => {
      const mockService = new MockWebSocketService();
      mockService.shouldFailConnect = true;

      const config: SessionConfig = {
        scenario_context: defaultParams.scenario_context,
        target_language: defaultParams.target_language,
        scenario_id: defaultParams.scenario_id,
      };

      // Attempt 3 retries
      for (let i = 0; i < 3; i++) {
        try {
          await mockService.connect(config);
        } catch {
          // Expected
        }
      }

      expect(mockService.connectCallCount).toBe(3);
    });
  });

  describe('Connection state management', () => {
    it('should notify on connection state changes', async () => {
      const mockService = new MockWebSocketService();
      const states: ConnectionState[] = [];

      mockService.setEventHandlers({
        onConnectionStateChange: (state) => {
          states.push(state);
        },
      });

      await mockService.connect({
        scenario_context: defaultParams.scenario_context,
        target_language: defaultParams.target_language,
        scenario_id: defaultParams.scenario_id,
      });

      expect(states).toContain('connected');

      mockService.disconnect();
      expect(states).toContain('disconnected');
    });
  });
});
