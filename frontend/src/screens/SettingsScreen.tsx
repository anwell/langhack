import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_LANGUAGE_SETTINGS, getLanguageSettings, saveLanguageSettings } from '../services/StorageService';
import { palette, shadow, tightShadow } from '../theme';

const TARGET_LANGUAGES = [
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
];

const SOURCE_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
];

export function SettingsScreen() {
  const [targetLanguage, setTargetLanguage] = useState(DEFAULT_LANGUAGE_SETTINGS.target_language);
  const [sourceLanguage, setSourceLanguage] = useState(DEFAULT_LANGUAGE_SETTINGS.source_language);
  const [showLiveEnglishTranslations, setShowLiveEnglishTranslations] = useState(
    DEFAULT_LANGUAGE_SETTINGS.show_live_english_translations
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const settings = await getLanguageSettings();
      setTargetLanguage(settings.target_language);
      setSourceLanguage(settings.source_language);
      setShowLiveEnglishTranslations(settings.show_live_english_translations);
    };
    load();
  }, []);

  const save = async () => {
    await saveLanguageSettings({
      target_language: targetLanguage,
      source_language: sourceLanguage,
      show_live_english_translations: showLiveEnglishTranslations,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.headline}>Settings</Text>
        <Text style={styles.subtitle}>Configure your learning preferences.</Text>
      </View>

      {/* Learning Path card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderIcon}>🌐</Text>
          <Text style={styles.cardHeaderTitle}>Learning Path</Text>
        </View>

        <Text style={styles.label}>TARGET LANGUAGE</Text>
        <View style={styles.optionRow}>
          {TARGET_LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={[styles.option, targetLanguage === language.code && styles.optionSelected]}
              onPress={() => setTargetLanguage(language.code)}
            >
              <Text style={styles.optionFlag}>{language.flag}</Text>
              <Text style={[styles.optionText, targetLanguage === language.code && styles.optionTextSelected]}>{language.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>SOURCE LANGUAGE</Text>
        <View style={styles.optionRow}>
          {SOURCE_LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={[styles.option, sourceLanguage === language.code && styles.optionSelected]}
              onPress={() => setSourceLanguage(language.code)}
            >
              <Text style={styles.optionFlag}>{language.flag}</Text>
              <Text style={[styles.optionText, sourceLanguage === language.code && styles.optionTextSelected]}>{language.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Preferences card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardHeaderIcon}>⚙️</Text>
          <Text style={styles.cardHeaderTitle}>Preferences</Text>
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>English Translations</Text>
            <Text style={styles.switchDescription}>Enable tap-to-translate on AI messages during conversations.</Text>
          </View>
          <Switch
            value={showLiveEnglishTranslations}
            onValueChange={setShowLiveEnglishTranslations}
            trackColor={{ false: palette.outlineVariant, true: palette.primaryFixedDim }}
            thumbColor={showLiveEnglishTranslations ? palette.primary : palette.surfaceContainerHighest}
            accessibilityLabel="Enable tap-to-translate on AI messages"
          />
        </View>
      </View>

      {/* Save button */}
      <View style={styles.saveSection}>
        <TouchableOpacity style={styles.saveButton} onPress={save}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>
        {saved && (
          <View style={styles.savedBanner}>
            <Text style={styles.savedText}>✓ Settings saved successfully</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 20 },
  headerSection: { paddingTop: 24, paddingBottom: 16 },
  headline: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: palette.onSurface, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, lineHeight: 24, color: palette.onSurfaceVariant },

  // Cards
  card: { backgroundColor: palette.surfaceContainerLowest, borderRadius: 16, padding: 20, marginBottom: 16, ...shadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  cardHeaderIcon: { fontSize: 20 },
  cardHeaderTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', color: palette.onSurface },

  // Labels
  label: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5, color: palette.onSurfaceVariant, marginBottom: 10, marginTop: 8 },

  // Language options
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 2, borderColor: palette.outlineVariant,
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: palette.surfaceContainerLowest,
  },
  optionSelected: { borderColor: palette.primary, backgroundColor: palette.surfaceContainer, ...tightShadow },
  optionFlag: { fontSize: 20 },
  optionText: { fontSize: 16, fontWeight: '600', color: palette.onSurface },
  optionTextSelected: { color: palette.primary },

  // Switch
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 8 },
  switchCopy: { flex: 1 },
  switchTitle: { fontSize: 16, fontWeight: '600', color: palette.onSurface },
  switchDescription: { fontSize: 14, lineHeight: 20, color: palette.onSurfaceVariant, marginTop: 4 },

  // Save
  saveSection: { marginTop: 8 },
  saveButton: { height: 48, borderRadius: 12, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', ...tightShadow },
  saveButtonText: { color: palette.onPrimary, fontSize: 14, fontWeight: '600' },
  savedBanner: { marginTop: 12, backgroundColor: palette.secondaryContainer, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  savedText: { fontSize: 14, fontWeight: '600', color: palette.onSecondaryContainer },
});
