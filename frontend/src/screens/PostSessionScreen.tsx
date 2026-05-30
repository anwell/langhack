import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useSharedValue, withTiming, withSpring, Easing, useAnimatedReaction, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { SessionFeedback, SessionRecord, TranscriptEntry } from '../types';
import { getCachedScenarios, getLanguageSettings, saveSession, updateSession } from '../services/StorageService';
import { requestFeedback, uploadTranscript } from '../services/ApiService';
import { PassFailBadge } from '../components/PassFailBadge';
import { AchievementRecord, updateAchievementState } from '../services/AchievementService';
import { palette, shadow, tightShadow } from '../theme';

/**
 * Returns the appropriate color for a given score.
 * Green (#16a34a) for >= 80, yellow/amber (#d97706) for 60-79, red (#dc2626) for < 60.
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#d97706';
  return '#dc2626';
}

/**
 * Animated score display that counts from 0 to the final score over ~1.5 seconds.
 * Displays the score prominently with the appropriate color based on the value.
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
      <Text
        style={[styles.scoreText, { color }]}
        accessibilityLabel={`Score: ${score} out of 100`}
      >
        {displayScore}
      </Text>
      <Text style={[styles.scoreLabel, { color }]}>/ 100</Text>
    </View>
  );
}

/**
 * Animated achievement badge that scales up from 0 to 1 using a spring animation.
 * Each badge appears with a bouncy entrance using withSpring({ damping: 8 }).
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
      // Check for new achievement badges
      const newBadges = await updateAchievementState(result.session_score);
      if (newBadges.length > 0) {
        setEarnedBadges(newBadges);
      }
      // Automatically trigger Box upload after feedback succeeds
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
      <Text style={styles.kicker}>SESSION WRAP</Text>
      <Text style={styles.title}>Session debrief</Text>
      <Text style={styles.subtitle}>{params.scenario_title}</Text>
      <View style={styles.savedStrip}>
        <Text style={styles.savedCount}>{params.transcript.length}</Text>
        <Text style={styles.savedCopy}>transcript entries saved to your logbook</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cloud backup</Text>
        {loadingUpload ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={palette.indigo} />
            <Text style={styles.uploadingText}>Uploading to Box...</Text>
          </View>
        ) : null}
        {boxUrl ? <Text style={styles.success}>Uploaded to Box.</Text> : null}
        {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
        {uploadError && feedback ? (
          <TouchableOpacity style={styles.smallButton} onPress={() => runUpload(feedback)}>
            <Text style={styles.buttonText}>Retry upload</Text>
          </TouchableOpacity>
        ) : null}
        {!loadingUpload && !boxUrl && !uploadError && !feedbackError ? (
          <Text style={styles.body}>Waiting for feedback before uploading...</Text>
        ) : null}
      </View>

      {loadingFeedback ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Analyzing your session...</Text>
        </View>
      ) : null}
      {feedbackError ? (
        <View>
          <Text style={styles.error}>{feedbackError}</Text>
          <TouchableOpacity style={styles.smallButton} onPress={getFeedback}>
            <Text style={styles.buttonText}>Retry feedback</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {feedback ? (
        <View style={styles.feedback}>
          <PassFailBadge result={feedback.session_pass_fail} />
          <AnimatedScoreDisplay score={feedback.session_score} />
          <View style={styles.highlightsSection}>
            <FeedbackList title="Performance highlights" items={feedback.performance_highlights} />
          </View>
          <View style={styles.improvementsSection}>
            <FeedbackList title="Areas for improvement" items={feedback.areas_for_improvement} />
          </View>
          <View style={styles.correctionsSection}>
            <Text style={styles.sectionTitle}>Corrections</Text>
            {feedback.corrections.map((item, index) => (
              <View key={`${item.original}-${index}`} style={styles.itemBox}>
                <Text>Original: {item.original}</Text>
                <Text>Try: {item.corrected}</Text>
                {item.explanation ? <Text style={styles.body}>{item.explanation}</Text> : null}
              </View>
            ))}
          </View>
          <View style={styles.vocabularySection}>
            <Text style={styles.sectionTitle}>Suggested vocabulary</Text>
            {feedback.suggested_vocabulary.map((item) => (
              <Text key={item.phrase} style={styles.body}>• {item.phrase} — {item.context}</Text>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Suggested scenarios</Text>
          {feedback.suggested_scenarios.map((item) => (
            <TouchableOpacity
              key={`${item.id || item.title}`}
              style={styles.itemBox}
              onPress={() => item.id && navigation?.navigate('Session', { scenario_id: item.id })}
            >
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text>{item.description}</Text>
              <Text style={styles.body}>{item.rationale}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.sectionTitle}>Lesson plan</Text>
          {feedback.lesson_plan.map((item) => (
            <View key={item.focus_area} style={styles.itemBox}>
              <Text style={styles.itemTitle}>{item.focus_area}</Text>
              {item.practice_phrases.map((phrase) => <Text key={phrase}>• {phrase}</Text>)}
            </View>
          ))}
          {earnedBadges.length > 0 ? (
            <View style={styles.achievementsSection}>
              <Text style={styles.sectionTitle}>Achievements unlocked!</Text>
              <View style={styles.badgesRow}>
                {earnedBadges.map((badge, index) => (
                  <AchievementBadge key={badge.id} badge={badge} delay={index * 200} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => <Text key={item} style={styles.body}>• {item}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.paper },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { color: palette.coral, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: '900', color: palette.ink },
  subtitle: { color: palette.muted, marginTop: 6, marginBottom: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginTop: 18, marginBottom: 8, color: palette.ink },
  body: { color: palette.ink, lineHeight: 21 },
  savedStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.amber, borderRadius: 8, padding: 14, marginBottom: 14, ...tightShadow },
  savedCount: { color: palette.ink, fontSize: 30, fontWeight: '900' },
  savedCopy: { flex: 1, color: palette.ink, fontWeight: '800' },
  card: { borderRadius: 8, padding: 16, backgroundColor: palette.surface, marginVertical: 12, borderWidth: 1, borderColor: palette.line, ...shadow },
  feedback: { marginTop: 16, borderRadius: 8, backgroundColor: palette.surface, padding: 16, borderWidth: 1, borderColor: palette.line, ...shadow },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 12, fontSize: 16, color: palette.muted, fontWeight: '800' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', padding: 14 },
  smallButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: palette.ink, paddingVertical: 10, paddingHorizontal: 14, ...tightShadow },
  buttonText: { color: '#fff', fontWeight: '700' },
  success: { color: palette.success, fontWeight: '800' },
  error: { color: palette.danger, marginTop: 10, fontWeight: '800' },
  itemBox: { backgroundColor: palette.surface, borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: palette.line },
  itemTitle: { fontWeight: '900', marginBottom: 4, color: palette.ink },
  scoreContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, marginBottom: 12 },
  scoreText: { fontSize: 64, fontWeight: '800', lineHeight: 72 },
  scoreLabel: { fontSize: 20, fontWeight: '600', marginTop: 4 },
  highlightsSection: { backgroundColor: palette.mint, borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.line },
  correctionsSection: { backgroundColor: palette.rose, borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.line },
  vocabularySection: { backgroundColor: palette.sky, borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.line },
  improvementsSection: { backgroundColor: palette.amber, borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.line },
  achievementsSection: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  badgeItem: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.amber, borderRadius: 8, padding: 14, minWidth: 90, borderWidth: 1, borderColor: palette.line, ...tightShadow },
  badgeIcon: { fontSize: 32, marginBottom: 4 },
  badgeLabel: { fontSize: 13, fontWeight: '900', color: palette.ink, textAlign: 'center' },
});
