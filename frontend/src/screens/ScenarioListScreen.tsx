import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, Easing } from 'react-native-reanimated';
import { Scenario } from '../types';
import { cacheScenarios, getCachedScenarios, getLanguageSettings } from '../services/StorageService';
import { fetchScenarios, generateScenarios, GenerateResult } from '../services/ApiService';
import { PRELOADED_SCENARIOS } from '../services/PreloadedScenarios';
import { palette, shadow, tightShadow } from '../theme';

interface Props {
  navigation?: { navigate: (screen: string, params?: unknown) => void };
}

/** Sort scenarios so Apify-generated ones (source === 'generated') appear first. */
function sortScenarios(scenarios: Scenario[]): Scenario[] {
  const sourceOrder: Record<string, number> = { generated: 0, backend: 1, preloaded: 2 };
  return [...scenarios].sort((a, b) => (sourceOrder[a.source] ?? 2) - (sourceOrder[b.source] ?? 2));
}

/** Animated card wrapper that fades in and slides up on mount */
function AnimatedCard({ children, index, animate }: { children: React.ReactNode; index: number; animate: boolean }) {
  const opacity = useSharedValue(animate ? 0 : 1);
  const translateY = useSharedValue(animate ? 30 : 0);
  const scale = useSharedValue(animate ? 0.95 : 1);

  useEffect(() => {
    if (animate) {
      const delay = index * 80; // stagger each card by 80ms
      opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 120 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
    }
  }, [animate, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export function ScenarioListScreen({ navigation }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [destination, setDestination] = useState('');
  const [generateStatus, setGenerateStatus] = useState<GenerateResult['status'] | null>(null);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [animateNewCards, setAnimateNewCards] = useState(false);
  const newCardIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const settings = await getLanguageSettings();
    setTargetLanguage(settings.target_language);
    const cached = await getCachedScenarios();
    const initial = cached.length > 0 ? cached : PRELOADED_SCENARIOS;
    setScenarios(sortScenarios(initial.filter((scenario) => scenario.target_language === settings.target_language)));
    try {
      const remote = await fetchScenarios(settings.target_language);
      await cacheScenarios(remote);
      setScenarios(sortScenarios(remote));
    } catch {
      if (cached.length === 0) {
        await cacheScenarios(PRELOADED_SCENARIOS);
      }
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
    setGenerateStatus(null);
    setGenerateMessage(null);
    setAnimateNewCards(false);
    newCardIdsRef.current = new Set();
    try {
      const settings = await getLanguageSettings();
      const trimmedDestination = destination.trim() || undefined;
      const result = await generateScenarios(settings.target_language, settings.source_language, undefined, trimmedDestination);
      setGenerateStatus(result.status);
      setGenerateMessage(result.message || null);
      if (result.scenarios.length > 0) {
        const tagged = result.scenarios.map((s) => ({
          ...s,
          source: result.status === 'generated' ? ('generated' as const) : ('backend' as const),
        }));
        // Track which cards are new so we can animate them
        newCardIdsRef.current = new Set(tagged.map((s) => s.id));
        await cacheScenarios(tagged);
        const merged = await getCachedScenarios();
        setScenarios(sortScenarios(merged.filter((scenario) => scenario.target_language === settings.target_language)));
        setAnimateNewCards(true);
      }
    } catch {
      setGenerateStatus('unavailable');
      setGenerateMessage('Could not reach the server.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.primary} />
        <Text style={styles.loadingText}>Loading scenarios...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={scenarios}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        numColumns={1}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headline}>Ready to speak?</Text>
            <Text style={styles.subtitle}>Select a scenario to start practicing your conversation skills.</Text>

            {/* Destination input + generate */}
            <View style={styles.generateRow}>
              <TextInput
                style={styles.destinationInput}
                placeholder="Enter a destination city..."
                placeholderTextColor={palette.outline}
                value={destination}
                onChangeText={setDestination}
                autoCapitalize="words"
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.generateButton, generating && styles.generateButtonDisabled]}
                onPress={addGenerated}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.generateButtonText}>Generate</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Status banner */}
            {generateStatus && (
              <View style={[styles.statusBanner, generateStatus === 'generated' ? styles.statusSuccess : styles.statusFallback]}>
                <Text style={styles.statusText}>
                  {generateStatus === 'generated'
                    ? '✓ Scenarios built from real TripAdvisor data via Apify'
                    : generateStatus === 'fallback'
                    ? 'Using curated practice scenarios (scraping unavailable)'
                    : 'Could not generate scenarios — showing cached list'}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const isNew = animateNewCards && newCardIdsRef.current.has(item.id);
          return (
            <AnimatedCard index={index} animate={isNew}>
              <TouchableOpacity
                style={[styles.card, item.source === 'generated' && styles.cardGenerated]}
                onPress={() => startScenario(item)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardBadgeRow}>
                    {item.source === 'generated' ? (
                      <View style={styles.apifyBadge}>
                        <Text style={styles.apifyBadgeText}>📍 TRIPADVISOR</Text>
                      </View>
                    ) : (
                      <View style={styles.levelBadge}>
                        <Text style={styles.levelBadgeText}>Practice</Text>
                      </View>
                    )}
                  </View>
                  {item.thumbnail ? <Text style={styles.cardIcon}>{item.thumbnail}</Text> : null}
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDescription}>{item.description}</Text>
                {item.key_vocabulary?.length ? (
                  <View style={styles.vocabRow}>
                    {item.key_vocabulary.slice(0, 3).map((phrase) => (
                      <Text key={phrase} style={styles.vocabChip}>{phrase}</Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.startButtonRow}>
                  <Text style={styles.startButton}>Start ▶</Text>
                </View>
              </TouchableOpacity>
            </AnimatedCard>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No scenarios cached yet. Try generating some above.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.background },
  loadingText: { fontSize: 16, color: palette.onSurfaceVariant, fontWeight: '500' },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  headline: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: palette.onSurface, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 18, lineHeight: 28, color: palette.onSurfaceVariant, fontWeight: '400', marginBottom: 24 },

  // Generate controls
  generateRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  destinationInput: {
    flex: 1,
    height: 48,
    borderWidth: 2,
    borderColor: palette.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: palette.onSurface,
    backgroundColor: palette.surfaceContainerLowest,
  },
  generateButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...tightShadow,
  },
  generateButtonDisabled: { opacity: 0.7 },
  generateButtonText: { color: palette.onPrimary, fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },

  // Status banner
  statusBanner: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, marginBottom: 8 },
  statusSuccess: { backgroundColor: '#e7fbf4', borderWidth: 1, borderColor: palette.secondary },
  statusFallback: { backgroundColor: palette.tertiaryFixed, borderWidth: 1, borderColor: palette.tertiaryFixedDim },
  statusText: { fontSize: 13, fontWeight: '600', color: palette.onSurface },

  // List
  listContent: { paddingBottom: 100 },

  // Cards
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: 16,
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: palette.outlineVariant,
    ...shadow,
  },
  cardGenerated: {
    borderBottomColor: palette.primary,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardBadgeRow: { flexDirection: 'row' },
  apifyBadge: { backgroundColor: 'rgba(0, 88, 190, 0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  apifyBadgeText: { fontSize: 12, fontWeight: '600', color: palette.primary, letterSpacing: 0.5 },
  levelBadge: { backgroundColor: palette.surfaceContainerHigh, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  levelBadgeText: { fontSize: 12, fontWeight: '600', color: palette.onSurfaceVariant, letterSpacing: 0.5 },
  cardIcon: { fontSize: 28 },
  cardTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: palette.onSurface, marginBottom: 8 },
  cardDescription: { fontSize: 16, lineHeight: 24, color: palette.onSurfaceVariant, marginBottom: 16 },
  vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  vocabChip: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: palette.surfaceContainerHigh,
    color: palette.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  startButtonRow: { alignItems: 'flex-end' },
  startButton: {
    overflow: 'hidden',
    backgroundColor: palette.primary,
    color: palette.onPrimary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  empty: { margin: 24, textAlign: 'center', color: palette.outline, fontSize: 16 },
});
