import { WebSocketService } from './WebSocketService';

describe('WebSocketService backend error messages', () => {
  it('surfaces backend error messages instead of a generic connection-lost error', () => {
    const service = new WebSocketService('ws://example.test/ws') as unknown as {
      ws: { close: jest.Mock } | null;
      connectionState: string;
      setEventHandlers: WebSocketService['setEventHandlers'];
      handleMessage: (event: MessageEvent) => void;
    };
    const errors: string[] = [];
    const states: string[] = [];

    service.ws = { close: jest.fn() };
    service.setEventHandlers({
      onError: (error) => errors.push(error.message),
      onConnectionStateChange: (state) => states.push(state),
    });

    service.handleMessage({
      data: JSON.stringify({
        type: 'error',
        message: 'Voice session failed. Check backend AWS Bedrock configuration and logs.',
      }),
    } as MessageEvent);

    expect(errors).toEqual([
      'Voice session failed. Check backend AWS Bedrock configuration and logs.',
    ]);
    expect(states).toContain('error');
    expect(service.ws).toBeNull();
  });
});

describe('WebSocketService transcript messages', () => {
  it('passes assistant English translations through transcript events', () => {
    const service = new WebSocketService('ws://example.test/ws') as unknown as {
      setEventHandlers: WebSocketService['setEventHandlers'];
      handleMessage: (event: MessageEvent) => void;
    };
    const transcripts: unknown[] = [];

    service.setEventHandlers({
      onTranscript: (entry) => transcripts.push(entry),
    });

    service.handleMessage({
      data: JSON.stringify({
        type: 'transcript',
        role: 'assistant',
        text: '¡Hola!',
        english_translation: 'Hello!',
        is_final: true,
      }),
    } as MessageEvent);

    expect(transcripts).toEqual([
      {
        role: 'assistant',
        text: '¡Hola!',
        english_translation: 'Hello!',
        is_final: true,
      },
    ]);
  });
});
