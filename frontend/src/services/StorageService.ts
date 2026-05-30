import AsyncStorage from '@react-native-async-storage/async-storage';
import { Scenario, SessionRecord } from '../types';

const SESSIONS_KEY = 'voice_language_practice.sessions';
const SCENARIOS_KEY = 'voice_language_practice.scenarios';
const SETTINGS_KEY = 'voice_language_practice.settings';

export interface LanguageSettings {
  target_language: string;
  source_language: string;
  show_live_english_translations: boolean;
}

export const DEFAULT_LANGUAGE_SETTINGS: LanguageSettings = {
  target_language: 'es',
  source_language: 'en',
  show_live_english_translations: true,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const sessions = await getSessions();
  const next = [record, ...sessions.filter((session) => session.id !== record.id)].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
  await writeJson(SESSIONS_KEY, next);
}

export async function getSessions(): Promise<SessionRecord[]> {
  const sessions = await readJson<SessionRecord[]>(SESSIONS_KEY, []);
  return sessions.sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return (await getSessions()).find((session) => session.id === id);
}

export async function updateSession(id: string, updates: Partial<SessionRecord>): Promise<void> {
  const sessions = await getSessions();
  await writeJson(
    SESSIONS_KEY,
    sessions.map((session) => (session.id === id ? { ...session, ...updates } : session))
  );
}

export async function cacheScenarios(scenarios: Scenario[]): Promise<void> {
  const existing = await getCachedScenarios();
  const byId = new Map<string, Scenario>();
  [...existing, ...scenarios].forEach((scenario) => byId.set(scenario.id, scenario));
  await writeJson(SCENARIOS_KEY, Array.from(byId.values()));
}

export async function getCachedScenarios(): Promise<Scenario[]> {
  return readJson<Scenario[]>(SCENARIOS_KEY, []);
}

export async function getLanguageSettings(): Promise<LanguageSettings> {
  const settings = await readJson<Partial<LanguageSettings>>(SETTINGS_KEY, DEFAULT_LANGUAGE_SETTINGS);
  return { ...DEFAULT_LANGUAGE_SETTINGS, ...settings };
}

export async function saveLanguageSettings(settings: LanguageSettings): Promise<void> {
  await writeJson(SETTINGS_KEY, settings);
}
