/**
 * SessionScreen — Real-time voice conversation UI.
 * Connects to the backend WebSocket, streams audio bidirectionally,
 * displays live transcript, and provides session controls.
 *
 * Requirements: 2.2, 2.4, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 5.1, 5.3
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { TranscriptEntry, SessionRecord } from '../types';
import {
  WebSocketService,
  ConnectionState,
  SessionConfig,
} from '../services/WebSocketService';
import { saveSession } from '../services/StorageService';

// Keep screen awake during session (expo-keep-awake or no-op if unavailable)
let activateKeepAwake: (() => void) | undefined;
let deactivateKeepAwake: (() => void) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const keepAwake = require('expo-keep-awake');
  activateKeepAwake = keepAwake.activateKeepAwake || keepAwake.activateKeepAwakeAsync;
  deactivateKeepAwake = keepAwake.deactivateKeepAwake || keepAwake.deactivateKeepAwakeAsync;
} catch {
  // expo-keep-awake not available — no-op
}

/**
 * Route params expected from navigation.
 */
export interface SessionScreenParams {
  scenario_context: string;
  target_language: string;
  scenario_id: string;
  scenario_title: string;
}

export interface SessionScreenProps {
  /** Route params passed from navigation */
  route?: { params: SessionScreenParams };
  /** Navigation object for navigating away */
  navigation?: { goBack: () => void; navigate: (screen: string, params?: unknown) => void };
  /** Allow injecting params directly (for testing or non-navigation usage) */
  params?: SessionScreenParams;
  /** Allow injecting a custom WebSocketService (for testing) */
  webSocketService?: WebSocketService;
}

export function SessionScreen({
  route,
  navigation,
  params: directParams,
  webSocketService: injectedService,
}: SessionScreenProps) {
  const params = directParams || route?.params;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const wsServiceRef = useRef<WebSocketService>(
    injectedService || new WebSocketService()
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const isSessionActive = connectionState === 'connected';
  const MAX_MANUAL_RETRIES = 3;

  /**
   * Persist the session transcript locally.
   * Requirements: 4.3, 8.9 — transcript is always saved locally regardless of upload outcome.
   */
  const persistSession = useCallback(
    async (finalTranscript: TranscriptEntry[]) => {
      if (!params || finalTranscript.length === 0) return undefined;
      const record: SessionRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        scenario_id: params.scenario_id,
        scenario_title: params.scenario_title,
        target_language: params.target_language,
        started_at: sessionStartRef.current,
        ended_at: new Date().toISOString(),
        transcript: finalTranscript,
      };
      try {
        await saveSession(record);
        return record.id;
      } catch {
        // Storage failure should not block the user flow
        return undefined;
      }
    },
    [params]
  );

  /**
   * Connect to the WebSocket and start the voice session.
   */
  const startSession = useCallback(async () => {
    if (!params) {
      setError('Missing session parameters. Please select a scenario first.');
      return;
    }

    setError(null);
    setConnectionState('connecting');

    const wsService = wsServiceRef.current;

    wsService.setEventHandlers({
      onTranscript: (entry) => {
        if (entry.is_final) {
          setTranscript((prev) => [
            ...prev,
            {
              role: entry.role,
              text: entry.text,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      },
      onSessionEnded: async (finalTranscript) => {
        if (finalTranscript && finalTranscript.length > 0) {
          setTranscript(finalTranscript);
        }
        setConnectionState('disconnected');
        deactivateKeepAwake?.();
        // Persist transcript locally immediately (Req 4.3, 8.9)
        const transcriptToSave = finalTranscript && finalTranscript.length > 0 ? finalTranscript : transcript;
        const sessionId = await persistSession(transcriptToSave);
        // Navigate to post-session screen with transcript data
        if (navigation) {
          navigation.navigate('PostSession', {
            session_id: sessionId,
            transcript: transcriptToSave,
            scenario_id: params.scenario_id,
            scenario_title: params.scenario_title,
            target_language: params.target_language,
          });
        }
      },
      onError: (err) => {
        setError(err.message || 'Connection error occurred');
        setConnectionState('error');
        deactivateKeepAwake?.();
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
    });

    const config: SessionConfig = {
      scenario_context: params.scenario_context,
      target_language: params.target_language,
      scenario_id: params.scenario_id,
    };

    try {
      activateKeepAwake?.();
      await wsService.connect(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setConnectionState('error');
      deactivateKeepAwake?.();
    }
  }, [params, navigation, transcript, persistSession]);

  /**
   * Stop the session and disconnect.
   */
  const stopSession = useCallback(() => {
    const wsService = wsServiceRef.current;
    wsService.disconnect();
    setConnectionState('disconnected');
    deactivateKeepAwake?.();
    // Persist transcript locally immediately (Req 4.3, 8.9)
    persistSession(transcript);

    // Navigate to post-session screen
    if (navigation && params) {
      navigation.navigate('PostSession', {
        transcript,
        scenario_id: params.scenario_id,
        scenario_title: params.scenario_title,
        target_language: params.target_language,
      });
    }
  }, [navigation, params, transcript, persistSession]);

  /**
   * Retry connection after an error.
   */
  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_MANUAL_RETRIES) {
      setError('Maximum retry attempts reached. Please go back and try again.');
      return;
    }
    setRetryCount((prev) => prev + 1);
    startSession();
  }, [retryCount, startSession]);

  // Start session on mount
  useEffect(() => {
    startSession();

    return () => {
      // Cleanup on unmount
      wsServiceRef.current.disconnect();
      deactivateKeepAwake?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new transcript entries arrive
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [transcript]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {params?.scenario_title || 'Voice Session'}
        </Text>
        {isSessionActive && <PulsingIndicator />}
      </View>

      {/* Connection status */}
      {connectionState === 'connecting' && (
        <View style={styles.statusBar}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.statusText}>Connecting...</Text>
        </View>
      )}

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          {retryCount < MAX_MANUAL_RETRIES && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry connection"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Transcript view */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.transcriptContainer}
        contentContainerStyle={styles.transcriptContent}
        accessibilityRole="list"
        accessibilityLabel="Conversation transcript"
      >
        {transcript.length === 0 && isSessionActive && (
          <Text style={styles.placeholderText}>
            Listening... Start speaking in {params?.target_language || 'the target language'}.
          </Text>
        )}
        {transcript.map((entry, index) => (
          <TranscriptBubble key={`${entry.timestamp}-${index}`} entry={entry} />
        ))}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {isSessionActive && (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopSession}
            accessibilityRole="button"
            accessibilityLabel="End session"
          >
            <View style={styles.stopIcon} />
            <Text style={styles.stopButtonText}>End Session</Text>
          </TouchableOpacity>
        )}
        {connectionState === 'disconnected' && !error && transcript.length > 0 && (
          <Text style={styles.sessionEndedText}>Session ended</Text>
        )}
      </View>
    </View>
  );
}

/**
 * A single transcript entry bubble.
 */
function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';

  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? 'You' : 'AI'}: ${entry.text}`}
    >
      <Text style={styles.bubbleLabel}>{isUser ? 'You' : 'AI'}</Text>
      <Text style={styles.bubbleText}>{entry.text}</Text>
    </View>
  );
}

/**
 * Pulsing dot indicator showing the session is active.
 */
function PulsingIndicator() {
  // Simple static indicator for React Native compatibility.
  // In a full implementation, this would use Animated API for pulsing effect.
  return (
    <View style={styles.pulsingContainer} accessibilityLabel="Session active">
      <View style={styles.pulsingDot} />
      <Text style={styles.pulsingText}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 12,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#E8F4FD',
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#007AFF',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3F3',
    borderBottomWidth: 1,
    borderBottomColor: '#FFD6D6',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#D32F2F',
  },
  retryButton: {
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#D32F2F',
    borderRadius: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptContent: {
    padding: 16,
    paddingBottom: 24,
  },
  placeholderText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 40,
  },
  bubble: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  bubbleLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    color: '#8E8E93',
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  controlsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#FF3B30',
    borderRadius: 28,
    minWidth: 180,
  },
  stopIcon: {
    width: 16,
    height: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    marginRight: 10,
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sessionEndedText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  pulsingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  pulsingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
});

export default SessionScreen;
