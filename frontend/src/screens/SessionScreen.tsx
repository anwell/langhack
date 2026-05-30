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
import { getLanguageSettings, saveSession } from '../services/StorageService';
import { palette, shadow, tightShadow } from '../theme';

// Keep screen awake during session (expo-keep-awake or no-op if unavailable)
let activateKeepAwake: (() => void | Promise<void>) | undefined;
let deactivateKeepAwake: (() => void | Promise<void>) | undefined;
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
  const [showEnglishTranslations, setShowEnglishTranslations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const wsServiceRef = useRef<WebSocketService>(
    injectedService || new WebSocketService()
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const keepAwakeActiveRef = useRef(false);
  const keepAwakeActivationRef = useRef<Promise<void> | null>(null);
  const isSessionActive = connectionState === 'connected';
  const MAX_MANUAL_RETRIES = 3;

  const activateSessionKeepAwake = useCallback(() => {
    if (!activateKeepAwake || keepAwakeActiveRef.current || keepAwakeActivationRef.current) {
      return;
    }

    keepAwakeActivationRef.current = Promise.resolve(activateKeepAwake())
      .then(() => {
        keepAwakeActiveRef.current = true;
      })
      .catch(() => {
        keepAwakeActiveRef.current = false;
      })
      .finally(() => {
        keepAwakeActivationRef.current = null;
      });
  }, []);

  const deactivateSessionKeepAwake = useCallback(() => {
    if (!deactivateKeepAwake && !keepAwakeActivationRef.current) {
      return;
    }

    void (async () => {
      try {
        await keepAwakeActivationRef.current;
        if (!keepAwakeActiveRef.current || !deactivateKeepAwake) {
          return;
        }
        keepAwakeActiveRef.current = false;
        await deactivateKeepAwake();
      } catch {
        keepAwakeActiveRef.current = false;
      }
    })();
  }, []);

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

    const languageSettings = await getLanguageSettings();
    setShowEnglishTranslations(languageSettings.show_live_english_translations);

    const wsService = wsServiceRef.current;

    wsService.setEventHandlers({
      onTranscript: (entry) => {
        if (entry.is_final) {
          setTranscript((prev) => [
            ...prev,
            {
              role: entry.role,
              text: entry.text,
              english_translation: entry.english_translation,
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
        deactivateSessionKeepAwake();
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
        deactivateSessionKeepAwake();
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
    });

    const config: SessionConfig = {
      scenario_context: params.scenario_context,
      target_language: params.target_language,
      scenario_id: params.scenario_id,
      show_english_translations: languageSettings.show_live_english_translations,
    };

    try {
      activateSessionKeepAwake();
      await wsService.connect(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      setConnectionState('error');
      deactivateSessionKeepAwake();
    }
  }, [params, navigation, transcript, persistSession, activateSessionKeepAwake, deactivateSessionKeepAwake]);

  /**
   * Stop the session and disconnect.
   */
  const stopSession = useCallback(() => {
    const wsService = wsServiceRef.current;
    wsService.disconnect();
    setConnectionState('disconnected');
    deactivateSessionKeepAwake();
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
  }, [navigation, params, transcript, persistSession, deactivateSessionKeepAwake]);

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
      deactivateSessionKeepAwake();
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
        <View style={styles.headerTextGroup}>
          <Text style={styles.headerKicker}>LIVE PRACTICE</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {params?.scenario_title || 'Voice Session'}
          </Text>
        </View>
        {isSessionActive && <PulsingIndicator />}
      </View>

      {/* Connection status */}
      {connectionState === 'connecting' && (
        <View style={styles.statusBar}>
          <ActivityIndicator size="small" color={palette.indigo} />
          <Text style={styles.statusText}>Opening the channel...</Text>
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
          <View style={styles.placeholderCard}>
          <Text style={styles.placeholderGlyph}>Listening</Text>
            <Text style={styles.placeholderText}>
              Listening for your first line in {params?.target_language || 'the target language'}.
            </Text>
          </View>
        )}
        {transcript.map((entry, index) => (
          <TranscriptBubble
            key={`${entry.timestamp}-${index}`}
            entry={entry}
            showEnglishTranslation={showEnglishTranslations}
          />
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
function TranscriptBubble({
  entry,
  showEnglishTranslation,
}: {
  entry: TranscriptEntry;
  showEnglishTranslation: boolean;
}) {
  const isUser = entry.role === 'user';
  const shouldShowEnglishTranslation =
    showEnglishTranslation && !isUser && Boolean(entry.english_translation);

  return (
    <View
      style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? 'You' : 'AI'}: ${entry.text}`}
    >
      <Text style={[styles.bubbleLabel, isUser ? styles.userBubbleLabel : styles.assistantBubbleLabel]}>
        {isUser ? 'You' : 'Coach'}
      </Text>
      <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.assistantBubbleText]}>{entry.text}</Text>
      {shouldShowEnglishTranslation ? (
        <View style={styles.translationContainer}>
          <Text style={styles.translationLabel}>English</Text>
          <Text style={styles.translationText}>{entry.english_translation}</Text>
        </View>
      ) : null}
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
    backgroundColor: palette.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 16,
    backgroundColor: palette.paper,
  },
  headerTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  headerKicker: {
    color: palette.coral,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: palette.ink,
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: palette.lilac,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: palette.indigo,
    fontWeight: '800',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: palette.rose,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: palette.danger,
  },
  retryButton: {
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: palette.danger,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.surface,
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptContent: {
    padding: 18,
    paddingBottom: 28,
  },
  placeholderCard: {
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    backgroundColor: palette.surface,
    padding: 20,
    marginTop: 36,
    maxWidth: 340,
    ...shadow,
  },
  placeholderGlyph: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.teal,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  placeholderText: {
    textAlign: 'center',
    fontSize: 16,
    color: palette.ink,
    marginTop: 6,
    lineHeight: 22,
    fontWeight: '700',
  },
  bubble: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    ...tightShadow,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: palette.indigo,
    borderColor: palette.indigo,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: palette.mint,
    borderColor: palette.line,
  },
  bubbleLabel: {
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  userBubbleLabel: { color: palette.lemon },
  assistantBubbleLabel: { color: palette.indigo },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userBubbleText: { color: palette.surface },
  assistantBubbleText: { color: palette.ink },
  translationContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  translationLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: palette.muted,
    marginBottom: 3,
  },
  translationText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    color: palette.muted,
  },
  controlsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: palette.coral,
    borderRadius: 8,
    minWidth: 180,
    borderWidth: 0,
    ...tightShadow,
  },
  stopIcon: {
    width: 16,
    height: 16,
    backgroundColor: palette.surface,
    borderRadius: 3,
    marginRight: 10,
  },
  stopButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.surface,
  },
  sessionEndedText: {
    fontSize: 16,
    color: palette.muted,
    fontWeight: '700',
  },
  pulsingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.teal,
    marginRight: 6,
  },
  pulsingText: {
    fontSize: 12,
    fontWeight: '900',
    color: palette.teal,
  },
});

export default SessionScreen;
