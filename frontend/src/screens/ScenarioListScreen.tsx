import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Scenario } from '../types';
import { cacheScenarios, getCachedScenarios, getLanguageSettings } from '../services/StorageService';
import { fetchScenarios, generateScenarios } from '../services/ApiService';
import { PRELOADED_SCENARIOS } from '../services/PreloadedScenarios';

interface Props {
  navigation?: { navigate: (screen: string, params?: unknown) => void };
}

export function ScenarioListScreen({ navigation }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [destination, setDestination] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const settings = await getLanguageSettings();
    setTargetLanguage(settings.target_language);
    const cached = await getCachedScenarios();
    const initial = cached.length > 0 ? cached : PRELOADED_SCENARIOS;
    setScenarios(initial.filter((scenario) => scenario.target_language === settings.target_language));
    try {
      const remote = await fetchScenarios(settings.target_language);
      await cacheScenarios(remote);
      setScenarios(remote);
    } catch {
      if (cached.length === 0) {
        await cacheScenarios(PRELOADED_SCENARIOS);
      }
      // Keep cached/preloaded scenarios when backend is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const startScenario = (scenario: Scenario) => {
    navigation?.navigate('Session', {
      scenario_context: `${scenario.title}: ${scenario.description}\n${scenario.system_prompt}`,
      target_language: scenario.target_language,
      scenario_id: scenario.id,
      scenario_title: scenario.title,
    });
  };

  const addGenerated = async () => {
    setGenerating(true);
    try {
      const settings = await getLanguageSettings();
      const trimmedDestination = destination.trim() || undefined;
      const generated = await generateScenarios(settings.target_language, settings.source_language, undefined, trimmedDestination);
      await cacheScenarios(generated);
      const merged = await getCachedScenarios();
      setScenarios(merged.filter((scenario) => scenario.target_language === settings.target_language));
    } catch {
      // Requirement 9.12: fail silently and keep local scenario list.
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading scenarios...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Practice scenarios</Text>
        <Text style={styles.subtitle}>Target language: {targetLanguage}</Text>
        <TextInput
          style={styles.destinationInput}
          placeholder="Enter a destination city (optional)"
          placeholderTextColor="#9ca3af"
          value={destination}
          onChangeText={setDestination}
          autoCapitalize="words"
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.generateButton} onPress={addGenerated} disabled={generating}>
          <Text style={styles.generateText}>{generating ? 'Generating...' : 'Generate more'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={scenarios}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => startScenario(item)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDescription}>{item.description}</Text>
            {item.key_vocabulary?.length ? (
              <Text style={styles.vocab}>Key phrases: {item.key_vocabulary.join(', ')}</Text>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No scenarios cached yet. Try Generate more.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 4, color: '#6b7280' },
  destinationInput: { marginTop: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, fontSize: 16, color: '#111827', backgroundColor: '#f9fafb' },
  generateButton: { marginTop: 12, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14 },
  generateText: { color: '#fff', fontWeight: '700' },
  card: { marginHorizontal: 16, marginTop: 14, borderRadius: 16, backgroundColor: '#fff', padding: 18, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  cardDescription: { marginTop: 8, color: '#374151', lineHeight: 20 },
  vocab: { marginTop: 10, color: '#2563eb' },
  empty: { margin: 24, textAlign: 'center', color: '#6b7280' },
});
