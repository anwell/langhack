import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Scenario } from '../types';
import { cacheScenarios, getCachedScenarios, getLanguageSettings } from '../services/StorageService';
import { fetchScenarios, generateScenarios } from '../services/ApiService';
import { PRELOADED_SCENARIOS } from '../services/PreloadedScenarios';
import { palette, shadow, tightShadow } from '../theme';

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
        <View style={styles.heroTopline}>
          <Text style={styles.kicker}>LANGHACK STUDIO</Text>
          <Text style={styles.languagePill}>{targetLanguage.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>Choose your next speaking drill</Text>
        <Text style={styles.subtitle}>Fast, situational practice for the moments that actually happen when you travel.</Text>
        <TextInput
          style={styles.destinationInput}
          placeholder="Add a destination city"
          placeholderTextColor={palette.muted}
          value={destination}
          onChangeText={setDestination}
          autoCapitalize="words"
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.generateButton} onPress={addGenerated} disabled={generating}>
          <Text style={styles.generateText}>{generating ? 'Generating...' : 'Generate scenarios'}</Text>
        </TouchableOpacity>
        <View style={styles.accentRail}>
          <View style={[styles.accentBlock, styles.accentCoral]} />
          <View style={[styles.accentBlock, styles.accentLemon]} />
          <View style={[styles.accentBlock, styles.accentTeal]} />
        </View>
      </View>
      <FlatList
        data={scenarios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => startScenario(item)}>
            <View style={styles.cardStripe} />
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.playGlyph}>Start</Text>
            </View>
            <Text style={styles.cardDescription}>{item.description}</Text>
            {item.key_vocabulary?.length ? (
              <View style={styles.vocabRow}>
                {item.key_vocabulary.slice(0, 3).map((phrase) => (
                  <Text key={phrase} style={styles.vocabChip}>{phrase}</Text>
                ))}
              </View>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No scenarios cached yet. Try Generate more.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: palette.paper },
  header: { width: '100%', maxWidth: 960, alignSelf: 'center', padding: 20, paddingBottom: 16, backgroundColor: palette.paper },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  kicker: { color: palette.coral, fontSize: 12, fontWeight: '800' },
  languagePill: { overflow: 'hidden', borderRadius: 999, backgroundColor: palette.ink, color: palette.surface, paddingHorizontal: 10, paddingVertical: 4, fontWeight: '800' },
  title: { fontSize: 32, lineHeight: 37, fontWeight: '900', color: palette.ink },
  subtitle: { marginTop: 8, color: palette.muted, fontSize: 15, lineHeight: 21, maxWidth: 520 },
  destinationInput: { marginTop: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: palette.ink, backgroundColor: palette.surface, ...tightShadow },
  generateButton: { marginTop: 12, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: palette.ink, paddingVertical: 12, paddingHorizontal: 16, ...tightShadow },
  generateText: { color: palette.surface, fontWeight: '800' },
  accentRail: { flexDirection: 'row', gap: 7, marginTop: 18 },
  accentBlock: { height: 4, borderRadius: 999 },
  accentCoral: { width: 56, backgroundColor: palette.coral },
  accentLemon: { width: 34, backgroundColor: palette.lemon },
  accentTeal: { width: 78, backgroundColor: palette.teal },
  listContent: { paddingBottom: 28 },
  card: { position: 'relative', width: '92%', maxWidth: 920, alignSelf: 'center', marginTop: 14, borderRadius: 8, backgroundColor: palette.surface, padding: 18, borderWidth: 1, borderColor: palette.line, overflow: 'hidden', ...shadow },
  cardStripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, backgroundColor: palette.teal },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingLeft: 8 },
  cardTitle: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '900', color: palette.ink },
  playGlyph: { overflow: 'hidden', borderRadius: 999, backgroundColor: palette.rose, color: palette.coral, fontSize: 12, lineHeight: 18, paddingHorizontal: 9, paddingVertical: 3, fontWeight: '800' },
  cardDescription: { marginTop: 8, paddingLeft: 8, color: palette.ink, lineHeight: 21 },
  vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingLeft: 8 },
  vocabChip: { overflow: 'hidden', borderRadius: 999, backgroundColor: palette.sky, color: palette.indigo, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '700' },
  empty: { margin: 24, textAlign: 'center', color: palette.muted },
});
