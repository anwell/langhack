import { Scenario } from '../types';

export const PRELOADED_SCENARIOS: Scenario[] = [
  {
    id: 'es-cafe-order',
    title: 'Order at a café',
    description: 'Practice ordering drinks and pastries, asking prices, and responding to follow-up questions.',
    target_language: 'es',
    key_vocabulary: ['un café', 'quisiera', 'para llevar', 'la cuenta'],
    system_prompt: 'You are a friendly barista in a busy Spanish-speaking café.',
    source: 'preloaded',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'es-directions-plaza',
    title: 'Ask for directions',
    description: 'Ask a local how to reach a plaza, understand landmarks, and confirm walking directions.',
    target_language: 'es',
    key_vocabulary: ['¿Dónde está...?', 'gire', 'siga derecho', 'cerca de'],
    system_prompt: 'You are a helpful local giving simple directions in Spanish.',
    source: 'preloaded',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fr-hotel-checkin',
    title: 'Hotel check-in',
    description: 'Practice checking in, spelling your name, asking about breakfast, and confirming room details.',
    target_language: 'fr',
    key_vocabulary: ['réservation', 'petit déjeuner', 'chambre', 'clé'],
    system_prompt: 'You are a hotel receptionist helping a French learner check in.',
    source: 'preloaded',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'fr-market-shopping',
    title: 'Market shopping',
    description: 'Buy produce at an outdoor market, ask quantities, compare prices, and make small talk.',
    target_language: 'fr',
    key_vocabulary: ['je voudrais', 'combien', 'un kilo', "c'est tout"],
    system_prompt: 'You are a patient vendor at a French outdoor market.',
    source: 'preloaded',
    created_at: '2026-01-01T00:00:00Z',
  },
];
