import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_LANGUAGE_SETTINGS, getLanguageSettings, saveLanguageSettings } from '../services/StorageService';

const TARGET_LANGUAGES = [
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
];

const SOURCE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
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
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sectionTitle}>Target language</Text>
      <View style={styles.row}>
        {TARGET_LANGUAGES.map((language) => (
          <TouchableOpacity
            key={language.code}
            style={[styles.choice, targetLanguage === language.code && styles.selected]}
            onPress={() => setTargetLanguage(language.code)}
          >
            <Text style={[styles.choiceText, targetLanguage === language.code && styles.selectedText]}>{language.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.sectionTitle}>Source language</Text>
      <View style={styles.row}>
        {SOURCE_LANGUAGES.map((language) => (
          <TouchableOpacity
            key={language.code}
            style={[styles.choice, sourceLanguage === language.code && styles.selected]}
            onPress={() => setSourceLanguage(language.code)}
          >
            <Text style={[styles.choiceText, sourceLanguage === language.code && styles.selectedText]}>{language.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.sectionTitle}>Live English translations</Text>
          <Text style={styles.helperText}>Show English below AI responses in the live transcript.</Text>
        </View>
        <Switch
          value={showLiveEnglishTranslations}
          onValueChange={setShowLiveEnglishTranslations}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={showLiveEnglishTranslations ? '#2563eb' : '#f9fafb'}
          accessibilityLabel="Show English translations in live transcript"
        />
      </View>
      <TouchableOpacity style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save settings</Text>
      </TouchableOpacity>
      {saved ? <Text style={styles.saved}>Settings saved.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f7f7fb' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  switchRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  switchCopy: { flex: 1 },
  helperText: { color: '#6b7280', lineHeight: 20 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff' },
  selected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  choiceText: { color: '#111827', fontWeight: '600' },
  selectedText: { color: '#fff' },
  button: { marginTop: 28, borderRadius: 12, backgroundColor: '#2563eb', padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  saved: { color: '#047857', marginTop: 12 },
});
