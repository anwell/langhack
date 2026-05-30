import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessionRecord, TranscriptEntry } from '../types';
import { getSessions } from '../services/StorageService';
import { palette, shadow, tightShadow } from '../theme';

export function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selected, setSelected] = useState<SessionRecord | null>(null);

  const load = useCallback(async () => {
    setSessions(await getSessions());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.headline}>Conversation History</Text>
        <Text style={styles.subtitle}>Reflect on your progress and review past interactions.</Text>
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        <View style={styles.chipActive}><Text style={styles.chipActiveText}>All Sessions</Text></View>
        <View style={styles.chip}><Text style={styles.chipText}>Last 7 Days</Text></View>
      </View>

      <FlatList
        data={sessions}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
            <View style={styles.cardRow}>
              <View style={styles.cardIconBox}>
                <Text style={styles.cardIconText}>💬</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.scenario_title}</Text>
                <Text style={styles.cardMeta}>{new Date(item.started_at).toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.tagRow}>
                <Text style={styles.tag}>{item.transcript.length} turns</Text>
                {item.box_file_url ? <Text style={styles.tagSuccess}>Box backup</Text> : null}
                {item.feedback ? <Text style={styles.tagSuccess}>Feedback</Text> : null}
              </View>
              <View style={styles.reviewButton}>
                <Text style={styles.reviewButtonText}>Review</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No saved sessions yet. Complete a practice session to see it here.</Text>}
      />

      {/* Detail modal */}
      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selected.scenario_title}</Text>
              <Text style={styles.modalMeta}>{new Date(selected.started_at).toLocaleString()}</Text>
            </View>
            <ScrollView style={styles.transcript}>
              {selected.transcript.map((entry, index) => (
                <HistoryTranscriptBubble key={`${entry.timestamp}-${index}`} entry={entry} />
              ))}
              {selected.feedback ? (
                <View style={styles.feedbackBox}>
                  <Text style={styles.feedbackTitle}>Performance Feedback</Text>
                  {selected.feedback.performance_highlights.map((item) => (
                    <Text key={item} style={styles.feedbackItem}>• {item}</Text>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            {selected.box_file_url ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => Linking.openURL(selected.box_file_url!)}>
                <Text style={styles.primaryButtonText}>View in Box</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelected(null)}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function HistoryTranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';
  const hasTranslation = !isUser && Boolean(entry.english_translation);
  const [showTranslation, setShowTranslation] = useState(false);

  const content = (
    <View style={[styles.turn, isUser ? styles.turnUser : styles.turnAssistant]}>
      <Text style={[styles.turnRole, isUser && { color: palette.onPrimary }]}>{isUser ? 'You' : 'AI'}</Text>
      <Text style={[styles.turnText, isUser && { color: palette.onPrimary }]}>{entry.text}</Text>
      {hasTranslation && !showTranslation && (
        <Text style={styles.turnTranslateHint}>🌐 Tap to translate</Text>
      )}
      {showTranslation && (
        <View style={styles.turnTranslationContainer}>
          <Text style={styles.turnTranslationText}>{entry.english_translation}</Text>
        </View>
      )}
    </View>
  );

  if (hasTranslation) {
    return (
      <TouchableOpacity onPress={() => setShowTranslation((prev) => !prev)} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  headerSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  headline: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: palette.onSurface, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, lineHeight: 24, color: palette.onSurfaceVariant },

  // Chips
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chipActive: { backgroundColor: palette.primaryContainer, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  chipActiveText: { fontSize: 14, fontWeight: '600', color: palette.onPrimaryContainer },
  chip: { backgroundColor: palette.surfaceContainerHigh, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 14, fontWeight: '600', color: palette.onSurfaceVariant },

  // List
  listContent: { paddingBottom: 100, paddingHorizontal: 20 },
  card: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: palette.surfaceContainer,
    ...shadow,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  cardIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: palette.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  cardIconText: { fontSize: 20 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: palette.onSurface },
  cardMeta: { fontSize: 14, fontWeight: '600', color: palette.onSurfaceVariant, marginTop: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { fontSize: 12, fontWeight: '500', color: palette.onSurfaceVariant, backgroundColor: palette.surfaceContainerHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  tagSuccess: { fontSize: 12, fontWeight: '500', color: palette.onSecondaryContainer, backgroundColor: palette.secondaryContainer, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  reviewButton: { backgroundColor: palette.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  reviewButtonText: { fontSize: 14, fontWeight: '600', color: palette.onPrimary },
  empty: { textAlign: 'center', color: palette.outline, marginTop: 40, fontSize: 16, lineHeight: 24 },

  // Modal
  modal: { flex: 1, padding: 20, backgroundColor: palette.background },
  modalHeader: { marginBottom: 20 },
  modalTitle: { fontSize: 28, lineHeight: 36, fontWeight: '600', color: palette.onSurface },
  modalMeta: { fontSize: 14, color: palette.onSurfaceVariant, marginTop: 4 },
  transcript: { flex: 1, marginVertical: 12 },
  turn: { padding: 16, borderRadius: 12, marginBottom: 10 },
  turnUser: { backgroundColor: palette.primary, alignSelf: 'flex-end', maxWidth: '85%', borderTopRightRadius: 4 },
  turnAssistant: { backgroundColor: palette.surfaceContainerLowest, alignSelf: 'flex-start', maxWidth: '85%', borderTopLeftRadius: 4, borderWidth: 1, borderColor: palette.outlineVariant },
  turnRole: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: palette.onSurfaceVariant, marginBottom: 4 },
  turnText: { fontSize: 16, lineHeight: 24, color: palette.onSurface },
  turnTranslateHint: { fontSize: 12, color: palette.outline, fontWeight: '500', marginTop: 6 },
  turnTranslationContainer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.outlineVariant },
  turnTranslationText: { fontSize: 14, lineHeight: 20, fontStyle: 'italic', color: palette.onSurfaceVariant },
  feedbackBox: { marginTop: 20, borderRadius: 16, backgroundColor: palette.secondaryContainer, padding: 20, gap: 6 },
  feedbackTitle: { fontSize: 18, fontWeight: '600', color: palette.onSecondaryContainer, marginBottom: 8 },
  feedbackItem: { fontSize: 14, lineHeight: 20, color: palette.onSecondaryContainer },
  primaryButton: { height: 48, borderRadius: 12, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12, ...tightShadow },
  primaryButtonText: { color: palette.onPrimary, fontWeight: '600', fontSize: 14 },
  secondaryButton: { height: 48, borderRadius: 12, backgroundColor: palette.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 2, borderColor: palette.primary },
  secondaryButtonText: { color: palette.primary, fontWeight: '600', fontSize: 14 },
});
