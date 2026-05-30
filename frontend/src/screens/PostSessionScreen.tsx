import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useSharedValue, withTiming, withSpring, Easing, useAnimatedReaction, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { SessionFeedback, SessionRecord, TranscriptEntry } from '../types';
import { getCachedScenarios, getLanguageSettings, saveSession, updateSession } from '../services/StorageService';
import { requestFeedback, uploadTranscript } from '../services/ApiService';
import { PassFailBadge } from '../components/PassFailBadge';
import { AchievementRecord, updateAchievementState } from '../services/AchievementService';
import { palette, shadow, tightShadow } from '../theme';

// Box logo served from public/ folder (Expo web static assets)
const BOX_LOGO_SOURCE = Platform.OS === 'web'
  ? { uri: '/box-logo.svg' }
  : require('../../assets/box-logo.svg');

/**
 * Returns the appropriate color for a given score.
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return palette.secondary;
  if (score >= 60) return palette.tertiary;
  return palette.error;
}

/**
 * Animated score display that counts from 0 to the final score.
 */
function AnimatedScoreDisplay({ score }: { score: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const animatedScore = useSharedValue(0);

  useEffect(() => {
    animatedScore.value = withTiming(score, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, [score]);

  useAnimatedReaction(
    () => Math.round(animatedScore.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayScore)(current);
      }
    },
    [animatedScore]
  );

  const color = getScoreColor(score);

  return (
    <View style={styles.scoreContainer}>
      <Text style={[styles.scoreText, { color }]} accessibilityLabel={`Score: ${score} out of 100`}>
        {displayScore}
      </Text>
      <Text style={[styles.scoreLabel, { color }]}>/ 100</Text>
    </View>
  );
}

/**
 * Animated achievement badge with spring entrance.
 */
function AchievementBadge({ badge, delay }: { badge: AchievementRecord; delay: number }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scale.value = withSpring(1, { damping: 8 });
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  return (
    <Animated.View style={[styles.badgeItem, animatedStyle]}>
      <Text style={styles.badgeIcon}>{badge.icon}</Text>
      <Text style={styles.badgeLabel}>{badge.label}</Text>
    </Animated.View>
  );
}

/** Progress bar with score fill */
function ScoreBar({ score }: { score: number }) {
  const color = getScoreColor(score);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${score}%`, backgroundColor: color }]} />
    </View>
  );
}

interface Params {
  session_id?: string;
  transcript: TranscriptEntry[];
  scenario_id: string;
  scenario_title: string;
  target_language: string;
}

interface Props {
  route?: { params: Params };
  params?: Params;
  navigation?: { navigate: (screen: string, params?: unknown) => void; goBack: () => void };
}

export function PostSessionScreen({ route, params: directParams, navigation }: Props) {
  const params = directParams || route?.params;
  const [sessionId, setSessionId] = useState(params?.session_id || '');
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [boxUrl, setBoxUrl] = useState<string | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<AchievementRecord[]>([]);
  const [scenarioVocab, setScenarioVocab] = useState<string[]>([]);

  const startedAt = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    if (!params) return;
    const ensureSession = async () => {
      const id = params.session_id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setSessionId(id);
      const record: SessionRecord = {
        id,
        scenario_id: params.scenario_id,
        scenario_title: params.scenario_title,
        target_language: params.target_language,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        transcript: params.transcript,
      };
      await saveSession(record);
      // Load scenario key vocabulary
      const scenarios = await getCachedScenarios();
      const scenario = scenarios.find((s) => s.id === params.scenario_id);
      if (scenario?.key_vocabulary?.length) {
        setScenarioVocab(scenario.key_vocabulary);
      }
    };
    ensureSession();
  }, [params, startedAt]);

  const runUpload = useCallback(async (feedbackData?: SessionFeedback) => {
    if (!params || !sessionId) return;
    setUploadError(null);
    setLoadingUpload(true);
    try {
      const url = await uploadTranscript({
        transcript: params.transcript,
        session_date: new Date().toISOString(),
        scenario_title: params.scenario_title,
        feedback: feedbackData,
      });
      setBoxUrl(url);
      await updateSession(sessionId, { box_file_url: url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Cloud backup failed');
    } finally {
      setLoadingUpload(false);
    }
  }, [params, sessionId]);

  const getFeedback = useCallback(async () => {
    if (!params || !sessionId) return;
    if (params.transcript.length === 0) return;
    setLoadingFeedback(true);
    setFeedbackError(null);
    try {
      const settings = await getLanguageSettings();
      const scenarios = await getCachedScenarios();
      const result = await requestFeedback({
        transcript: params.transcript,
        target_language: params.target_language,
        source_language: settings.source_language,
        available_scenarios: scenarios.map((scenario) => ({ id: scenario.id, title: scenario.title })),
      });
      setFeedback(result);
      await updateSession(sessionId, { feedback: result });
      const newBadges = await updateAchievementState(result.session_score);
      if (newBadges.length > 0) {
        setEarnedBadges(newBadges);
      }
      runUpload(result);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Feedback is temporarily unavailable');
    } finally {
      setLoadingFeedback(false);
    }
  }, [params, sessionId, runUpload]);

  useEffect(() => {
    if (params && sessionId && params.transcript.length > 0 && !feedback && !loadingFeedback) {
      getFeedback();
    }
  }, [sessionId]);

  if (!params) {
    return <Text>Missing session data.</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.headline}>Session Recap</Text>
      <Text style={styles.subtitle}>{params.scenario_title}</Text>

      {/* Stats bento grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardPrimary]}>
          <Text style={styles.statIcon}>💬</Text>
          <Text style={styles.statValue}>{params.transcript.length}</Text>
          <Text style={styles.statLabel}>Exchanges</Text>
        </View>
        <View style={[styles.statCard, styles.statCardSecondary]}>
          <Text style={styles.statIcon}>📝</Text>
          <Text style={styles.statValue}>{params.transcript.filter(t => t.role === 'user').length}</Text>
          <Text style={styles.statLabel}>Your Turns</Text>
        </View>
        <View style={[styles.statCard, styles.statCardNeutral]}>
          <Image source={BOX_LOGO_SOURCE} style={styles.boxLogoImage} resizeMode="contain" accessibilityLabel="Box logo" />
          <Text style={styles.statValue}>{boxUrl ? '✓' : loadingUpload ? '...' : '—'}</Text>
          <Text style={styles.statLabel}>Box Backup</Text>
        </View>
      </View>

      {/* Upload status */}
      {uploadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{uploadError}</Text>
          {feedback ? (
            <TouchableOpacity style={styles.retryChip} onPress={() => runUpload(feedback)}>
              <Text style={styles.retryChipText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Box upload completed link */}
      {boxUrl ? (
        <TouchableOpacity
          style={styles.boxLinkCard}
          onPress={() => Linking.openURL(boxUrl)}
          activeOpacity={0.85}
          accessibilityRole="link"
          accessibilityLabel="View session report in Box"
        >
          <View style={styles.boxLinkIcon}>
            <Image source={BOX_LOGO_SOURCE} style={styles.boxLinkLogoImage} resizeMode="contain" />
          </View>
          <View style={styles.boxLinkContent}>
            <Text style={styles.boxLinkTitle}>Saved to Box</Text>
            <Text style={styles.boxLinkSubtitle}>Tap to view your session report</Text>
          </View>
          <Text style={styles.boxLinkArrow}>→</Text>
        </TouchableOpacity>
      ) : null}

      {/* Loading state */}
      {loadingFeedback ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Analyzing your session...</Text>
          <Text style={styles.loadingSubtext}>Our AI tutor is reviewing your conversation</Text>
        </View>
      ) : null}

      {/* Feedback error */}
      {feedbackError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorCardText}>{feedbackError}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={getFeedback}>
            <Text style={styles.primaryButtonText}>Retry Analysis</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Feedback results */}
      {feedback ? (
        <View style={styles.feedbackSection}>
          {/* Pass/Fail + Score */}
          <View style={styles.scoreCard}>
            <PassFailBadge result={feedback.session_pass_fail} />
            <AnimatedScoreDisplay score={feedback.session_score} />
            <ScoreBar score={feedback.session_score} />
            <Text style={styles.scoreHint}>
              {feedback.session_score >= 80 ? 'Excellent work!' : feedback.session_score >= 60 ? 'Good progress — keep practicing!' : 'Keep going, you\'re improving!'}
            </Text>
          </View>

          {/* Key Vocabulary from the scenario */}
          {scenarioVocab.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconBox, { backgroundColor: palette.primaryFixed }]}>
                  <Text style={styles.sectionIconText}>📖</Text>
                </View>
                <Text style={styles.sectionTitle}>Key Vocabulary</Text>
              </View>
              {scenarioVocab.map((word) => {
                const transcriptText = params.transcript.map((t) => t.text.toLowerCase()).join(' ');
                const wasUsed = transcriptText.includes(word.toLowerCase());
                // Try to find a definition from the feedback's suggested_vocabulary
                const match = feedback.suggested_vocabulary.find(
                  (sv) => sv.phrase.toLowerCase() === word.toLowerCase()
                );
                return (
                  <View key={word} style={styles.keyVocabItem}>
                    <View style={styles.keyVocabHeader}>
                      <Text style={styles.keyVocabUsedIcon}>{wasUsed ? '✓' : '○'}</Text>
                      <Text style={[styles.keyVocabPhrase, wasUsed && styles.keyVocabPhraseUsed]}>{word}</Text>
                    </View>
                    {match ? (
                      <Text style={styles.keyVocabDefinition}>{match.translation}</Text>
                    ) : null}
                  </View>
                );
              })}
              <Text style={styles.keyVocabLegend}>✓ = used in conversation</Text>
            </View>
          )}

          {/* Performance Highlights */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBox, { backgroundColor: palette.secondaryContainer }]}>
                <Text style={styles.sectionIconText}>✓</Text>
              </View>
              <Text style={styles.sectionTitle}>Performance Highlights</Text>
            </View>
            {feedback.performance_highlights.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Areas for Improvement */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBox, { backgroundColor: palette.tertiaryFixed }]}>
                <Text style={styles.sectionIconText}>↑</Text>
              </View>
              <Text style={styles.sectionTitle}>Areas for Improvement</Text>
            </View>
            {feedback.areas_for_improvement.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Corrections */}
          {feedback.corrections.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconBox, { backgroundColor: palette.errorContainer }]}>
                  <Text style={styles.sectionIconText}>✎</Text>
                </View>
                <Text style={styles.sectionTitle}>Corrections</Text>
              </View>
              {feedback.corrections.map((item, index) => (
                <View key={`${item.original}-${index}`} style={styles.correctionItem}>
                  <View style={styles.correctionOriginal}>
                    <Text style={styles.correctionLabel}>Original</Text>
                    <Text style={styles.correctionText}>{item.original}</Text>
                  </View>
                  <View style={styles.correctionCorrected}>
                    <Text style={styles.correctionLabel}>Corrected</Text>
                    <Text style={styles.correctionText}>{item.corrected}</Text>
                  </View>
                  {item.explanation ? <Text style={styles.correctionExplanation}>{item.explanation}</Text> : null}
                </View>
              ))}
            </View>
          )}

          {/* Suggested Vocabulary */}
          {feedback.suggested_vocabulary.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconBox, { backgroundColor: palette.primaryFixed }]}>
                  <Text style={styles.sectionIconText}>📖</Text>
                </View>
                <Text style={styles.sectionTitle}>Suggested Vocabulary</Text>
              </View>
              {feedback.suggested_vocabulary.map((item) => (
                <View key={item.phrase} style={styles.vocabItem}>
                  <Text style={styles.vocabPhrase}>{item.phrase}</Text>
                  <Text style={styles.vocabContext}>{item.context}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Suggested Scenarios */}
          {feedback.suggested_scenarios.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconBox, { backgroundColor: palette.surfaceContainerHigh }]}>
                  <Text style={styles.sectionIconText}>🎯</Text>
                </View>
                <Text style={styles.sectionTitle}>What to Practice Next</Text>
              </View>
              {feedback.suggested_scenarios.map((item) => (
                <TouchableOpacity
                  key={`${item.id || item.title}`}
                  style={styles.scenarioSuggestion}
                  onPress={() => item.id && navigation?.navigate('Session', { scenario_id: item.id })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.scenarioTitle}>{item.title}</Text>
                  <Text style={styles.scenarioDescription}>{item.description}</Text>
                  <Text style={styles.scenarioRationale}>{item.rationale}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Lesson Plan */}
          {feedback.lesson_plan.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconBox, { backgroundColor: palette.surfaceVariant }]}>
                  <Text style={styles.sectionIconText}>📋</Text>
                </View>
                <Text style={styles.sectionTitle}>Lesson Plan</Text>
              </View>
              {feedback.lesson_plan.map((item) => (
                <View key={item.focus_area} style={styles.lessonItem}>
                  <Text style={styles.lessonFocus}>{item.focus_area}</Text>
                  {item.practice_phrases.map((phrase) => (
                    <View key={phrase} style={styles.phraseChip}>
                      <Text style={styles.phraseChipText}>{phrase}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Achievements */}
          {earnedBadges.length > 0 && (
            <View style={styles.achievementsCard}>
              <Text style={styles.achievementsTitle}>🏆 Achievements Unlocked!</Text>
              <View style={styles.badgesRow}>
                {earnedBadges.map((badge, index) => (
                  <AchievementBadge key={badge.id} badge={badge} delay={index * 200} />
                ))}
              </View>
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingBottom: 60 },

  // Header
  headline: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: palette.onSurface, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 18, lineHeight: 28, color: palette.onSurfaceVariant, marginBottom: 24 },

  // Stats bento grid
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', ...tightShadow },
  statCardPrimary: { backgroundColor: palette.primaryContainer },
  statCardSecondary: { backgroundColor: palette.secondaryContainer },
  statCardNeutral: { backgroundColor: palette.surfaceContainerLowest, borderWidth: 1, borderColor: palette.outlineVariant },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statValue: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: palette.onSurface },
  statLabel: { fontSize: 12, fontWeight: '500', color: palette.onSurfaceVariant, marginTop: 4 },
  boxLogoImage: { width: 36, height: 20, marginBottom: 8 },

  // Error banner
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.errorContainer, borderRadius: 12, padding: 14, marginBottom: 16 },
  errorBannerText: { flex: 1, fontSize: 14, color: palette.onErrorContainer, fontWeight: '500' },
  retryChip: { backgroundColor: palette.error, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 12 },
  retryChipText: { fontSize: 13, fontWeight: '600', color: palette.onError },

  // Box link
  boxLinkCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surfaceContainerLowest, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#0061D5', ...tightShadow },
  boxLinkIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  boxLinkLogoImage: { width: 32, height: 18 },
  boxLinkContent: { flex: 1 },
  boxLinkTitle: { fontSize: 15, fontWeight: '600', color: '#0061D5' },
  boxLinkSubtitle: { fontSize: 13, color: palette.onSurfaceVariant, marginTop: 2 },
  boxLinkArrow: { fontSize: 18, color: '#0061D5', fontWeight: '600' },

  // Loading
  loadingCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, backgroundColor: palette.surfaceContainerLowest, borderRadius: 16, marginBottom: 16, ...shadow },
  loadingText: { marginTop: 16, fontSize: 18, fontWeight: '600', color: palette.onSurface },
  loadingSubtext: { marginTop: 4, fontSize: 14, color: palette.onSurfaceVariant },

  // Error card
  errorCard: { backgroundColor: palette.errorContainer, borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' },
  errorCardText: { fontSize: 16, color: palette.onErrorContainer, marginBottom: 16, textAlign: 'center' },

  // Buttons
  primaryButton: { height: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', ...tightShadow },
  primaryButtonText: { fontSize: 14, fontWeight: '600', color: palette.onPrimary },

  // Feedback section
  feedbackSection: { gap: 16 },

  // Score card
  scoreCard: { backgroundColor: palette.surfaceContainerLowest, borderRadius: 16, padding: 24, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: palette.outlineVariant, ...shadow },
  scoreContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  scoreText: { fontSize: 72, fontWeight: '700', lineHeight: 80 },
  scoreLabel: { fontSize: 20, fontWeight: '600', marginTop: 4 },
  scoreHint: { fontSize: 16, fontWeight: '500', color: palette.onSurfaceVariant, marginTop: 12 },

  // Progress bar
  progressTrack: { width: '100%', height: 12, backgroundColor: palette.surfaceContainer, borderRadius: 999, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%', borderRadius: 999 },

  // Section cards
  sectionCard: { backgroundColor: palette.surfaceContainerLowest, borderRadius: 16, padding: 20, borderBottomWidth: 2, borderBottomColor: palette.surfaceContainer, ...shadow },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionIconText: { fontSize: 18 },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: palette.onSurface },

  // List items
  listItem: { flexDirection: 'row', gap: 8, marginBottom: 8, paddingLeft: 4 },
  listBullet: { fontSize: 16, color: palette.onSurfaceVariant, lineHeight: 24 },
  listText: { flex: 1, fontSize: 16, lineHeight: 24, color: palette.onSurface },

  // Corrections
  correctionItem: { backgroundColor: palette.surfaceContainerLow, borderRadius: 12, padding: 16, marginBottom: 12 },
  correctionOriginal: { marginBottom: 8 },
  correctionCorrected: { marginBottom: 8 },
  correctionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: palette.onSurfaceVariant, marginBottom: 4 },
  correctionText: { fontSize: 16, lineHeight: 24, color: palette.onSurface },
  correctionExplanation: { fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant, fontStyle: 'italic', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.outlineVariant },

  // Vocabulary
  vocabItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.outlineVariant },
  vocabPhrase: { fontSize: 16, fontWeight: '600', color: palette.primary, marginBottom: 2 },
  vocabContext: { fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant },

  // Key Vocabulary (scenario vocab in recap)
  keyVocabItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.outlineVariant },
  keyVocabHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyVocabUsedIcon: { fontSize: 14, color: palette.secondary, fontWeight: '700', width: 20 },
  keyVocabPhrase: { fontSize: 16, fontWeight: '600', color: palette.onSurface },
  keyVocabPhraseUsed: { color: palette.secondary },
  keyVocabDefinition: { fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant, marginTop: 2, marginLeft: 28 },
  keyVocabLegend: { fontSize: 12, color: palette.outline, marginTop: 12, fontStyle: 'italic' },

  // Scenario suggestions
  scenarioSuggestion: { backgroundColor: palette.surfaceContainerLow, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: palette.outlineVariant },
  scenarioTitle: { fontSize: 16, fontWeight: '600', color: palette.onSurface, marginBottom: 4 },
  scenarioDescription: { fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant, marginBottom: 4 },
  scenarioRationale: { fontSize: 13, lineHeight: 18, color: palette.outline, fontStyle: 'italic' },

  // Lesson plan
  lessonItem: { marginBottom: 16 },
  lessonFocus: { fontSize: 16, fontWeight: '600', color: palette.onSurface, marginBottom: 8 },
  phraseChip: { backgroundColor: palette.surfaceContainerHigh, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 6 },
  phraseChipText: { fontSize: 14, fontWeight: '500', color: palette.primary },

  // Achievements
  achievementsCard: { backgroundColor: palette.tertiaryFixed, borderRadius: 16, padding: 20, alignItems: 'center', ...shadow },
  achievementsTitle: { fontSize: 20, fontWeight: '700', color: palette.onSurface, marginBottom: 16 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  badgeItem: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceContainerLowest, borderRadius: 16, padding: 16, minWidth: 100, ...tightShadow },
  badgeIcon: { fontSize: 32, marginBottom: 6 },
  badgeLabel: { fontSize: 13, fontWeight: '700', color: palette.onSurface, textAlign: 'center' },
});
