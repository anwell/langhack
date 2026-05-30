import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SessionRecord } from '../types';
import { getSessions } from '../services/StorageService';

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
      <Text style={styles.title}>Transcript history</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            <Text style={styles.cardTitle}>{item.scenario_title}</Text>
            <Text style={styles.meta}>{new Date(item.started_at).toLocaleString()}</Text>
            <Text style={styles.meta}>{item.transcript.length} transcript entries</Text>
            {item.box_file_url ? <Text style={styles.link}>View in Box available</Text> : null}
            {item.feedback ? <Text style={styles.link}>Feedback saved</Text> : null}
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
  container: { flex: 1, padding: 20, backgroundColor: '#f7f7fb' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16, color: '#111827' },
  card: { borderRadius: 14, backgroundColor: '#fff', padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  meta: { color: '#6b7280', marginTop: 4 },
  link: { color: '#2563eb', marginTop: 6, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 32 },
  modal: { flex: 1, padding: 20, backgroundColor: '#fff' },
  transcript: { flex: 1, marginVertical: 12 },
  turn: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  role: { textTransform: 'uppercase', color: '#2563eb', fontWeight: '700', marginBottom: 4 },
  feedbackBox: { marginTop: 20, borderRadius: 12, backgroundColor: '#eef2ff', padding: 14, gap: 4 },
  button: { borderRadius: 12, backgroundColor: '#2563eb', padding: 14, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { backgroundColor: '#f3f4f6' },
  secondaryText: { color: '#111827' },
});
