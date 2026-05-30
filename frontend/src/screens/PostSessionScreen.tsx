import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessionFeedback, SessionRecord, TranscriptEntry } from '../types';
import { getCachedScenarios, getLanguageSettings, saveSession, updateSession } from '../services/StorageService';
import { requestFeedback, uploadTranscript } from '../services/ApiService';

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
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const runUpload = useCallback(async () => {
    if (!params || !sessionId) return;
    setUploadError(null);
    try {
      const url = await uploadTranscript({
        transcript: params.transcript,
        session_date: new Date().toISOString(),
        scenario_title: params.scenario_title,
      });
      setBoxUrl(url);
      await updateSession(sessionId, { box_file_url: url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Cloud backup failed');
    }
  }, [params, sessionId]);

  useEffect(() => {
    runUpload();
  }, [runUpload]);

  const getFeedback = async () => {
    if (!params || !sessionId) return;
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
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Feedback is temporarily unavailable');
    } finally {
      setLoadingFeedback(false);
    }
  };

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
        {boxUrl ? <Text style={styles.success}>Uploaded to Box.</Text> : null}
        {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
        {uploadError ? (
          <TouchableOpacity style={styles.smallButton} onPress={runUpload}>
            <Text style={styles.buttonText}>Retry upload</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity style={styles.button} onPress={getFeedback} disabled={loadingFeedback}>
        {loadingFeedback ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request teacher feedback</Text>}
      </TouchableOpacity>
      {feedbackError ? <Text style={styles.error}>{feedbackError}</Text> : null}

      {feedback ? (
        <View style={styles.feedback}>
          <FeedbackList title="Performance highlights" items={feedback.performance_highlights} />
          <FeedbackList title="Areas for improvement" items={feedback.areas_for_improvement} />
          <Text style={styles.sectionTitle}>Corrections</Text>
          {feedback.corrections.map((item, index) => (
            <View key={`${item.original}-${index}`} style={styles.itemBox}>
              <Text>Original: {item.original}</Text>
              <Text>Try: {item.corrected}</Text>
              {item.explanation ? <Text style={styles.body}>{item.explanation}</Text> : null}
            </View>
          ))}
          <Text style={styles.sectionTitle}>Suggested vocabulary</Text>
          {feedback.suggested_vocabulary.map((item) => (
            <Text key={item.phrase} style={styles.body}>• {item.phrase} — {item.context}</Text>
          ))}
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
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', padding: 14 },
  smallButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14 },
  buttonText: { color: '#fff', fontWeight: '700' },
  success: { color: '#047857' },
  error: { color: '#b91c1c', marginTop: 10 },
  itemBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 10 },
  itemTitle: { fontWeight: '700', marginBottom: 4 },
});
