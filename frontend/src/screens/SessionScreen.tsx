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
import { fetchReplySuggestion, ReplySuggestion } from '../services/ApiService';
import { palette, shadow, tightShadow } from '../theme';

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  en: 'English',
};

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

export interface SessionScreenParams {
  scenario_context: string;
  target_language: string;
  scenario_id: string;
  scenario_title: string;
  intended_outcome?: string;
}

export interface SessionScreenProps {
  route?: { params: SessionScreenParams };
  navigation?: { goBack: () => void; navigate: (screen: string, params?: unknown) => void };
  params?: SessionScreenParams;
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
  const [suggestion, setSuggestion] = useState<ReplySuggestion | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionFetchedForRef = useRef<number>(0);

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
      .then(() => { keepAwakeActiveRef.current = true; })
      .catch(() => { keepAwakeActiveRef.current = false; })
      .finally(() => { keepAwakeActivationRef.current = null; });
  }, []);

  const deactivateSessionKeepAwake = useCallback(() => {
    if (!deactivateKeepAwake && !keepAwakeActivationRef.current) return;
    void (async () => {
      try {
        await keepAwakeActivationRef.current;
        if (!keepAwakeActiveRef.current || !deactivateKeepAwake) return;
        keepAwakeActiveRef.current = false;
        await deactivateKeepAwake();
      } catch { keepAwakeActiveRef.current = false; }
    })();
  }, []);

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
      } catch { return undefined; }
    },
    [params]
  );

  const startSession = useCallback(async () => {
    if (!params) {
      setError('Missing session parameters. Please select a scenario first.');
      return;
    }
    setError(null);
    setConnectionState('connecting');

    const languageSettings = await getLanguageSettings();

    const wsService = wsServiceRef.current;
    wsService.setEventHandlers({
      onTranscript: (entry) => {
        if (entry.is_final) {
          setTranscript((prev) => [
            ...prev,
            { role: entry.role, text: entry.text, english_translation: entry.english_translation, timestamp: new Date().toISOString() },
          ]);
        }
      },
      onSessionEnded: async (finalTranscript, outcomeAchieved) => {
        if (finalTranscript && finalTranscript.length > 0) setTranscript(finalTranscript);
        setConnectionState('disconnected');
        deactivateSessionKeepAwake();
        const transcriptToSave = finalTranscript && finalTranscript.length > 0 ? finalTranscript : transcript;
        const sessionId = await persistSession(transcriptToSave);
        if (navigation) {
          navigation.navigate('PostSession', {
            session_id: sessionId, transcript: transcriptToSave,
            scenario_id: params.scenario_id, scenario_title: params.scenario_title, target_language: params.target_language,
            outcome_achieved: outcomeAchieved,
          });
        }
      },
      onError: (err) => { setError(err.message || 'Connection error occurred'); setConnectionState('error'); deactivateSessionKeepAwake(); },
      onConnectionStateChange: (state) => { setConnectionState(state); },
    });

    const config: SessionConfig = {
      scenario_context: params.scenario_context,
      target_language: params.target_language,
      scenario_id: params.scenario_id,
      show_english_translations: languageSettings.show_live_english_translations,
      intended_outcome: params.intended_outcome,
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

  const stopSession = useCallback(() => {
    const wsService = wsServiceRef.current;
    wsService.disconnect();
    setConnectionState('disconnected');
    deactivateSessionKeepAwake();
    persistSession(transcript);
    if (navigation && params) {
      navigation.navigate('PostSession', {
        transcript, scenario_id: params.scenario_id, scenario_title: params.scenario_title, target_language: params.target_language,
      });
    }
  }, [navigation, params, transcript, persistSession, deactivateSessionKeepAwake]);

  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_MANUAL_RETRIES) {
      setError('Maximum retry attempts reached. Please go back and try again.');
      return;
    }
    setRetryCount((prev) => prev + 1);
    startSession();
  }, [retryCount, startSession]);

  useEffect(() => {
    startSession();
    return () => { wsServiceRef.current.disconnect(); deactivateSessionKeepAwake(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollViewRef.current) scrollViewRef.current.scrollToEnd({ animated: true });
  }, [transcript]);

  // Suggestion timer: when the last message is from the assistant and 5s pass, fetch a suggestion
  useEffect(() => {
    // Clear any existing timer
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }

    // Clear suggestion when user speaks
    const lastEntry = transcript[transcript.length - 1];
    if (!lastEntry || lastEntry.role === 'user') {
      setSuggestion(null);
      return;
    }

    // Don't re-fetch for the same transcript length
    if (suggestionFetchedForRef.current === transcript.length) return;

    // Last message is from assistant — start timer
    setSuggestion(null);
    suggestionTimerRef.current = setTimeout(async () => {
      if (!params || !isSessionActive) return;
      suggestionFetchedForRef.current = transcript.length;
      try {
        const result = await fetchReplySuggestion({
          transcript: transcript.slice(-6),
          target_language: params.target_language,
          scenario_context: params.scenario_context,
        });
        if (result.suggestion) {
          setSuggestion(result);
        }
      } catch {
        // Silently fail — suggestion is optional
      }
    }, 5000);

    return () => {
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
      }
    };
  }, [transcript, isSessionActive, params]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {params?.scenario_title || 'Voice Session'}
          </Text>
          <Text style={styles.headerSubtitle}>Scenario Practice</Text>
        </View>
        {isSessionActive && <PulsingIndicator />}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: isSessionActive ? '33%' : '0%' }]} />
      </View>

      {/* Intended outcome */}
      {params?.intended_outcome ? (
        <View style={styles.outcomeBar}>
          <Text style={styles.outcomeBarLabel}>Goal:</Text>
          <Text style={styles.outcomeBarText}>{params.intended_outcome}</Text>
        </View>
      ) : null}

      {/* Connection status */}
      {connectionState === 'connecting' && (
        <View style={styles.statusBar}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.statusText}>Connecting...</Text>
        </View>
      )}

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          {retryCount < MAX_MANUAL_RETRIES && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry connection">
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Transcript */}
      <ScrollView ref={scrollViewRef} style={styles.transcriptContainer} contentContainerStyle={styles.transcriptContent} accessibilityRole="list" accessibilityLabel="Conversation transcript">
        {transcript.length === 0 && isSessionActive && (
          <View style={styles.welcomeCard}>
            <View style={styles.welcomeAvatar}>
              <Text style={styles.welcomeAvatarText}>AI</Text>
            </View>
            <Text style={styles.welcomeText}>
              You are ready to practice. Start speaking in {LANGUAGE_NAMES[params?.target_language ?? ''] || params?.target_language || 'the target language'}.
            </Text>
          </View>
        )}
        {transcript.map((entry, index) => (
          <TranscriptBubble key={`${entry.timestamp}-${index}`} entry={entry} />
        ))}
      </ScrollView>

      {/* Reply suggestion */}
      {suggestion && isSessionActive ? (
        <View style={styles.suggestionContainer}>
          <Text style={styles.suggestionLabel}>Try saying:</Text>
          <Text style={styles.suggestionText}>{suggestion.suggestion}</Text>
          <Text style={styles.suggestionTranslation}>{suggestion.translation}</Text>
        </View>
      ) : null}

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {isSessionActive && (
          <TouchableOpacity style={styles.stopButton} onPress={stopSession} accessibilityRole="button" accessibilityLabel="End session">
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

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';
  const hasTranslation = !isUser && Boolean(entry.english_translation);
  const [showTranslation, setShowTranslation] = useState(false);

  const handlePress = useCallback(() => {
    if (hasTranslation) {
      setShowTranslation((prev) => !prev);
    }
  }, [hasTranslation]);

  const bubble = (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]} accessibilityRole="text" accessibilityLabel={`${isUser ? 'You' : 'AI'}: ${entry.text}`}>
      <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.assistantBubbleText]}>{entry.text}</Text>
      {hasTranslation && !showTranslation && (
        <View style={styles.translateHint}>
          <Text style={styles.translateHintText}>🌐 Tap to translate</Text>
        </View>
      )}
      {showTranslation && (
        <View style={styles.translationContainer}>
          <Text style={styles.translationText}>{entry.english_translation}</Text>
        </View>
      )}
    </View>
  );

  if (hasTranslation) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${entry.text}. ${showTranslation ? 'Translation shown' : 'Tap to translate'}`}
        accessibilityHint={showTranslation ? 'Tap to hide translation' : 'Tap to show English translation'}
      >
        {bubble}
      </TouchableOpacity>
    );
  }

  return bubble;
}

function PulsingIndicator() {
  return (
    <View style={styles.pulsingContainer} accessibilityLabel="Session active">
      <View style={styles.pulsingDot} />
      <Text style={styles.pulsingText}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 12,
    backgroundColor: palette.background,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: palette.primary },
  headerSubtitle: { fontSize: 12, fontWeight: '500', color: palette.onSurfaceVariant, marginTop: 2 },

  // Progress
  progressTrack: { height: 4, backgroundColor: 'rgba(194, 198, 214, 0.3)', width: '100%' },
  progressFill: { height: '100%', backgroundColor: palette.secondary },

  // Status
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: palette.surfaceContainerLow },
  statusText: { marginLeft: 8, fontSize: 14, color: palette.primary, fontWeight: '600' },

  // Error
  errorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: palette.errorContainer },
  errorText: { flex: 1, fontSize: 14, color: palette.onErrorContainer },
  retryButton: { marginLeft: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: palette.error, borderRadius: 8 },
  retryButtonText: { fontSize: 14, fontWeight: '600', color: palette.onError },

  // Transcript
  transcriptContainer: { flex: 1 },
  transcriptContent: { padding: 20, paddingBottom: 28 },

  // Welcome
  welcomeCard: { alignItems: 'center', alignSelf: 'center', maxWidth: 300, marginTop: 40 },
  welcomeAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 16, ...shadow },
  welcomeAvatarText: { fontSize: 20, fontWeight: '700', color: palette.onPrimaryContainer },
  welcomeText: { textAlign: 'center', fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant, fontWeight: '500' },

  // Bubbles
  bubble: { maxWidth: '85%', marginBottom: 16, padding: 16, borderRadius: 16, ...tightShadow },
  userBubble: { alignSelf: 'flex-end', backgroundColor: palette.primary, borderTopRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: palette.surfaceContainerLowest, borderTopLeftRadius: 4, borderBottomWidth: 2, borderBottomColor: palette.outlineVariant },
  bubbleText: { fontSize: 16, lineHeight: 24 },
  userBubbleText: { color: palette.onPrimary },
  assistantBubbleText: { color: palette.onSurface },
  translationContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.outlineVariant },
  translationText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic', color: palette.onSurfaceVariant },
  translateHint: { marginTop: 6 },
  translateHintText: { fontSize: 12, color: palette.outline, fontWeight: '500' },

  // Outcome bar
  outcomeBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, backgroundColor: palette.mint, borderBottomWidth: 1, borderBottomColor: palette.line },
  outcomeBarLabel: { fontSize: 12, fontWeight: '900', color: palette.teal, marginRight: 6 },
  outcomeBarText: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.ink },

  // Suggestion
  suggestionContainer: { paddingHorizontal: 18, paddingVertical: 12, backgroundColor: palette.lilac, borderTopWidth: 1, borderTopColor: palette.line },
  suggestionLabel: { fontSize: 11, fontWeight: '800', color: palette.indigo, textTransform: 'uppercase', marginBottom: 4 },
  suggestionText: { fontSize: 16, fontWeight: '700', color: palette.ink, marginBottom: 2 },
  suggestionTranslation: { fontSize: 13, color: palette.muted, fontStyle: 'italic' },

  // Controls
  controlsContainer: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, backgroundColor: palette.surfaceContainerLowest, borderTopWidth: 1, borderTopColor: palette.outlineVariant },
  stopButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, paddingHorizontal: 32, backgroundColor: palette.error, borderRadius: 12, minWidth: 180, ...tightShadow },
  stopIcon: { width: 14, height: 14, backgroundColor: palette.onError, borderRadius: 3, marginRight: 10 },
  stopButtonText: { fontSize: 14, fontWeight: '600', color: palette.onError },
  sessionEndedText: { fontSize: 16, color: palette.outline, fontWeight: '600' },

  // Pulsing
  pulsingContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surfaceContainerHigh, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.secondary, marginRight: 6 },
  pulsingText: { fontSize: 12, fontWeight: '600', color: palette.secondary },
});

export default SessionScreen;
