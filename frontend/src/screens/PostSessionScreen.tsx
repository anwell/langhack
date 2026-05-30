import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useSharedValue, withTiming, withSpring, Easing, useAnimatedReaction, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { SessionFeedback, SessionRecord, TranscriptEntry } from '../types';
import { getCachedScenarios, getLanguageSettings, saveSession, updateSession } from '../services/StorageService';
import { requestFeedback, uploadTranscript } from '../services/ApiService';
import { PassFailBadge } from '../components/PassFailBadge';
import { AchievementRecord, updateAchievementState } from '../services/AchievementService';

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
      <Text style={styles.title}>Session review</Text>
      <Text style={styles.subtitle}>{params.scenario_title}</Text>
      <Text style={styles.sectionTitle}>Transcript saved locally</Text>
      <Text style={styles.body}>{params.transcript.length} entries are available in History.</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cloud backup</Text>
        {loadingUpload ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color="#2563eb" />
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
  container: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6b7280', marginTop: 4, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8, color: '#111827' },
  body: { color: '#374151', lineHeight: 20 },
  card: { borderRadius: 16, padding: 16, backgroundColor: '#fff', marginVertical: 12 },
  feedback: { marginTop: 16, borderRadius: 16, backgroundColor: '#fff', padding: 16 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#6b7280', fontWeight: '500' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { color: '#6b7280', fontSize: 14 },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', padding: 14 },
  smallButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14 },
  buttonText: { color: '#fff', fontWeight: '700' },
  success: { color: '#047857' },
  error: { color: '#b91c1c', marginTop: 10 },
  itemBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 10 },
  itemTitle: { fontWeight: '700', marginBottom: 4 },
  scoreContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, marginBottom: 12 },
  scoreText: { fontSize: 64, fontWeight: '800', lineHeight: 72 },
  scoreLabel: { fontSize: 20, fontWeight: '600', marginTop: 4 },
  highlightsSection: { backgroundColor: '#dcfce7', borderRadius: 12, padding: 14, marginBottom: 12 },
  correctionsSection: { backgroundColor: '#fee2e2', borderRadius: 12, padding: 14, marginBottom: 12 },
  vocabularySection: { backgroundColor: '#dbeafe', borderRadius: 12, padding: 14, marginBottom: 12 },
  improvementsSection: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 14, marginBottom: 12 },
  achievementsSection: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  badgeItem: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef9c3', borderRadius: 16, padding: 14, minWidth: 90 },
  badgeIcon: { fontSize: 32, marginBottom: 4 },
  badgeLabel: { fontSize: 13, fontWeight: '700', color: '#111827', textAlign: 'center' },
});
