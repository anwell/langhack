import {
  Scenario,
  SessionFeedback,
  TranscriptEntry,
} from '../types';

const API_BASE_URL = 'http://localhost:8000';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchScenarios(targetLanguage?: string): Promise<Scenario[]> {
  const query = targetLanguage ? `?target_language=${encodeURIComponent(targetLanguage)}` : '';
  return requestJson<Scenario[]>(`/scenarios${query}`);
}

export interface GenerateResult {
  scenarios: Scenario[];
  status: 'generated' | 'fallback' | 'unavailable';
  message?: string;
}

export async function generateScenarios(
  targetLanguage: string,
  sourceLanguage: string,
  proficiency?: string,
  destination?: string
): Promise<GenerateResult> {
  const body: Record<string, string | undefined> = {
    target_language: targetLanguage,
    source_language: sourceLanguage,
    proficiency,
  };
  if (destination) {
    body.destination = destination;
  }
  const payload = await requestJson<{ success: boolean; status: string; scenarios: Scenario[]; message?: string }>('/scenarios/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    scenarios: payload.success ? payload.scenarios : [],
    status: (payload.status as GenerateResult['status']) || 'unavailable',
    message: payload.message,
  };
}

export async function requestFeedback(input: {
  transcript: TranscriptEntry[];
  target_language: string;
  source_language: string;
  available_scenarios: Array<{ id: string; title: string }>;
}): Promise<SessionFeedback> {
  const payload = await requestJson<{ success: boolean; feedback?: SessionFeedback; error?: string }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!payload.success || !payload.feedback) {
    throw new Error(payload.error || 'Feedback is temporarily unavailable');
  }
  return payload.feedback;
}

export async function uploadTranscript(input: {
  transcript: TranscriptEntry[];
  session_date: string;
  scenario_title: string;
  feedback?: SessionFeedback;
}): Promise<string> {
  const payload = await requestJson<{ success: boolean; box_file_url?: string; error?: string }>(
    '/transcripts/upload',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  if (!payload.success || !payload.box_file_url) {
    throw new Error(payload.error || 'Cloud backup failed');
  }
  return payload.box_file_url;
}

export interface ReplySuggestion {
  suggestion: string;
  translation: string;
}

export async function fetchReplySuggestion(input: {
  transcript: TranscriptEntry[];
  target_language: string;
  scenario_context?: string;
}): Promise<ReplySuggestion> {
  return requestJson<ReplySuggestion>('/suggest', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
