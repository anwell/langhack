import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessionRecord } from '../types';
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
      <Text style={styles.kicker}>LOGBOOK</Text>
      <Text style={styles.title}>Saved conversations</Text>
      <FlatList
        data={sessions}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            <View style={styles.cardCap} />
            <Text style={styles.cardTitle}>{item.scenario_title}</Text>
            <Text style={styles.meta}>{new Date(item.started_at).toLocaleString()}</Text>
            <Text style={styles.meta}>{item.transcript.length} transcript entries</Text>
            <View style={styles.tagRow}>
              {item.box_file_url ? <Text style={styles.tag}>Box backup</Text> : null}
              {item.feedback ? <Text style={styles.tag}>Feedback saved</Text> : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No saved sessions yet.</Text>}
      />
      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={styles.modal}>
            <Text style={styles.title}>{selected.scenario_title}</Text>
            <Text style={styles.meta}>{new Date(selected.started_at).toLocaleString()}</Text>
            <ScrollView style={styles.transcript}>
              {selected.transcript.map((entry, index) => (
                <View key={`${entry.timestamp}-${index}`} style={styles.turn}>
                  <Text style={styles.role}>{entry.role}</Text>
                  <Text>{entry.text}</Text>
                </View>
              ))}
              {selected.feedback ? (
                <View style={styles.feedbackBox}>
                  <Text style={styles.cardTitle}>Feedback</Text>
                  {selected.feedback.performance_highlights.map((item) => (
                    <Text key={item}>• {item}</Text>
                  ))}
                </View>
              ) : null}
            </ScrollView>
            {selected.box_file_url ? (
              <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(selected.box_file_url!)}>
                <Text style={styles.buttonText}>View in Box</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setSelected(null)}>
              <Text style={[styles.buttonText, styles.secondaryText]}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: palette.paper },
  kicker: { color: palette.coral, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '900', marginBottom: 16, color: palette.ink },
  listContent: { paddingBottom: 24 },
  card: { position: 'relative', borderRadius: 8, backgroundColor: palette.surface, padding: 16, paddingTop: 21, marginBottom: 14, borderWidth: 1, borderColor: palette.line, overflow: 'hidden', ...shadow },
  cardCap: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: palette.lemon },
  cardTitle: { fontSize: 18, fontWeight: '900', color: palette.ink },
  meta: { color: palette.muted, marginTop: 4, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { overflow: 'hidden', borderRadius: 999, backgroundColor: palette.lilac, color: palette.indigo, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700' },
  link: { color: palette.indigo, marginTop: 6, fontWeight: '700' },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 32, fontWeight: '600' },
  modal: { flex: 1, padding: 20, backgroundColor: palette.paper },
  transcript: { flex: 1, marginVertical: 12 },
  turn: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.surface, marginBottom: 10 },
  role: { textTransform: 'uppercase', color: palette.coral, fontWeight: '800', marginBottom: 4 },
  feedbackBox: { marginTop: 20, borderRadius: 8, backgroundColor: palette.lilac, padding: 14, gap: 4, borderWidth: 1, borderColor: palette.line },
  button: { borderRadius: 8, backgroundColor: palette.ink, padding: 14, alignItems: 'center', marginTop: 10, ...tightShadow },
  buttonText: { color: '#fff', fontWeight: '800' },
  secondary: { backgroundColor: palette.surface },
  secondaryText: { color: palette.ink },
});
