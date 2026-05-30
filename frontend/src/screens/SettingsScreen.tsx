import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_LANGUAGE_SETTINGS, getLanguageSettings, saveLanguageSettings } from '../services/StorageService';
import { palette, shadow, tightShadow } from '../theme';

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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const settings = await getLanguageSettings();
      setTargetLanguage(settings.target_language);
      setSourceLanguage(settings.source_language);
    };
    load();
  }, []);

  const save = async () => {
    await saveLanguageSettings({ target_language: targetLanguage, source_language: sourceLanguage });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>STUDIO CONTROLS</Text>
      <Text style={styles.title}>Tune your practice setup</Text>
      <View style={styles.panel}>
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
      </View>
      <TouchableOpacity style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save settings</Text>
      </TouchableOpacity>
      {saved ? <Text style={styles.saved}>Settings saved.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: palette.paper },
  kicker: { color: palette.coral, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '900', color: palette.ink, marginBottom: 18 },
  panel: { backgroundColor: palette.surface, borderRadius: 8, borderWidth: 1, borderColor: palette.line, padding: 16, ...shadow },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: palette.ink, marginTop: 16, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { borderRadius: 8, borderWidth: 1, borderColor: palette.line, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: palette.surface },
  selected: { backgroundColor: palette.mint, borderColor: palette.teal, ...tightShadow },
  choiceText: { color: palette.ink, fontWeight: '700' },
  selectedText: { color: palette.ink },
  button: { marginTop: 28, borderRadius: 8, backgroundColor: palette.ink, padding: 14, alignItems: 'center', ...tightShadow },
  buttonText: { color: '#fff', fontWeight: '800' },
  saved: { color: palette.success, marginTop: 12, fontWeight: '800' },
});
