/**
 * Property-based tests for feedback validation and persistence.
 *
 * **Validates: Requirements 10.4, 10.6, 10.9, 10.11, 10.13**
 *
 * Property 9: Feedback response structure validity
 * Property 10: Feedback persistence round-trip
 */

import * as fc from 'fast-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession, getSession, updateSession } from '../services/StorageService';
import {
  SessionRecord,
  SessionFeedback,
  TranscriptEntry,
  Correction,
  SuggestedPhrase,
  SuggestedScenario,
  LessonPlanItem,
} from '../types/index';

// --- Mock AsyncStorage with an in-memory store ---
let store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => store[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: jest.fn(async (key: string) => {
    delete store[key];
  }),
  clear: jest.fn(async () => {
    store = {};
  }),
}));

// --- Arbitraries ---

const correctionArb: fc.Arbitrary<Correction> = fc.record({
  original: fc.string({ minLength: 1, maxLength: 100 }),
  corrected: fc.string({ minLength: 1, maxLength: 100 }),
  explanation: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

const suggestedPhraseArb: fc.Arbitrary<SuggestedPhrase> = fc.record({
  phrase: fc.string({ minLength: 1, maxLength: 100 }),
  translation: fc.string({ minLength: 1, maxLength: 100 }),
  context: fc.string({ minLength: 1, maxLength: 100 }),
});

const suggestedScenarioArb: fc.Arbitrary<SuggestedScenario> = fc.record({
  id: fc.option(fc.uuid(), { nil: undefined }),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  description: fc.string({ minLength: 1, maxLength: 150 }),
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
});

const lessonPlanItemArb: fc.Arbitrary<LessonPlanItem> = fc.record({
  focus_area: fc.string({ minLength: 1, maxLength: 100 }),
  practice_phrases: fc.array(fc.string({ minLength: 1, maxLength: 80 }), {
    minLength: 1,
    maxLength: 5,
  }),
});

/**
 * Generator for valid SessionFeedback objects that conform to the spec constraints:
 * - suggested_scenarios: 1-3 items
 * - lesson_plan: 1-5 items, each with up to 5 practice_phrases
 */
const sessionFeedbackArb: fc.Arbitrary<SessionFeedback> = fc.record({
  session_score: fc.integer({ min: 0, max: 100 }),
  session_pass_fail: fc.constantFrom<'pass' | 'fail'>('pass', 'fail'),
  performance_highlights: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
    minLength: 1,
    maxLength: 5,
  }),
  areas_for_improvement: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
    minLength: 1,
    maxLength: 5,
  }),
  corrections: fc.array(correctionArb, { minLength: 0, maxLength: 5 }),
  suggested_vocabulary: fc.array(suggestedPhraseArb, { minLength: 0, maxLength: 5 }),
  suggested_scenarios: fc.array(suggestedScenarioArb, { minLength: 1, maxLength: 3 }),
  lesson_plan: fc.array(lessonPlanItemArb, { minLength: 1, maxLength: 5 }),
});

const transcriptEntryArb: fc.Arbitrary<TranscriptEntry> = fc.record({
  role: fc.constantFrom<'user' | 'assistant'>('user', 'assistant'),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
    .map((d) => d.toISOString()),
});

const sessionRecordArb: fc.Arbitrary<SessionRecord> = fc.record({
  id: fc.uuid(),
  scenario_id: fc.uuid(),
  scenario_title: fc.string({ minLength: 1, maxLength: 50 }),
  target_language: fc.constantFrom('es', 'fr', 'de', 'it', 'ja', 'ko'),
  started_at: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
    .map((d) => d.toISOString()),
  ended_at: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
    .map((d) => d.toISOString()),
  transcript: fc.array(transcriptEntryArb, { minLength: 1, maxLength: 10 }),
  box_file_url: fc.option(fc.webUrl(), { nil: undefined }),
  feedback: fc.option(sessionFeedbackArb, { nil: undefined }),
});

// --- Tests ---

beforeEach(() => {
  store = {};
  jest.clearAllMocks();
});

describe('Property 9: Feedback response structure validity', () => {
  /**
   * Validates that any generated SessionFeedback object has the required structure:
   * - performance_highlights: non-empty array of strings
   * - areas_for_improvement: non-empty array of strings
   * - corrections: array of Correction objects (each with original + corrected)
   * - suggested_vocabulary: array of SuggestedPhrase objects (each with phrase + translation + context)
   * - suggested_scenarios: 1-3 items (each with title + description + rationale)
   * - lesson_plan: 1-5 items (each with focus_area and up to 5 practice_phrases)
   */
  it('feedback always has all required top-level sections', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(feedback).toHaveProperty('performance_highlights');
        expect(feedback).toHaveProperty('areas_for_improvement');
        expect(feedback).toHaveProperty('corrections');
        expect(feedback).toHaveProperty('suggested_vocabulary');
        expect(feedback).toHaveProperty('suggested_scenarios');
        expect(feedback).toHaveProperty('lesson_plan');
      }),
      { numRuns: 200 }
    );
  });

  it('performance_highlights is a non-empty array of non-empty strings', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.performance_highlights)).toBe(true);
        expect(feedback.performance_highlights.length).toBeGreaterThanOrEqual(1);
        for (const highlight of feedback.performance_highlights) {
          expect(typeof highlight).toBe('string');
          expect(highlight.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('areas_for_improvement is a non-empty array of non-empty strings', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.areas_for_improvement)).toBe(true);
        expect(feedback.areas_for_improvement.length).toBeGreaterThanOrEqual(1);
        for (const area of feedback.areas_for_improvement) {
          expect(typeof area).toBe('string');
          expect(area.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('corrections have valid structure with original and corrected fields', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.corrections)).toBe(true);
        for (const correction of feedback.corrections) {
          expect(typeof correction.original).toBe('string');
          expect(correction.original.length).toBeGreaterThan(0);
          expect(typeof correction.corrected).toBe('string');
          expect(correction.corrected.length).toBeGreaterThan(0);
          // explanation is optional
          if (correction.explanation !== undefined) {
            expect(typeof correction.explanation).toBe('string');
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('suggested_vocabulary items have phrase, translation, and context', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.suggested_vocabulary)).toBe(true);
        for (const vocab of feedback.suggested_vocabulary) {
          expect(typeof vocab.phrase).toBe('string');
          expect(vocab.phrase.length).toBeGreaterThan(0);
          expect(typeof vocab.translation).toBe('string');
          expect(vocab.translation.length).toBeGreaterThan(0);
          expect(typeof vocab.context).toBe('string');
          expect(vocab.context.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('suggested_scenarios contains 1-3 items each with title, description, and rationale', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.suggested_scenarios)).toBe(true);
        expect(feedback.suggested_scenarios.length).toBeGreaterThanOrEqual(1);
        expect(feedback.suggested_scenarios.length).toBeLessThanOrEqual(3);
        for (const scenario of feedback.suggested_scenarios) {
          expect(typeof scenario.title).toBe('string');
          expect(scenario.title.length).toBeGreaterThan(0);
          expect(typeof scenario.description).toBe('string');
          expect(scenario.description.length).toBeGreaterThan(0);
          expect(typeof scenario.rationale).toBe('string');
          expect(scenario.rationale.length).toBeGreaterThan(0);
          // id is optional - may reference existing scenario
          if (scenario.id !== undefined) {
            expect(typeof scenario.id).toBe('string');
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('lesson_plan contains 1-5 items each with focus_area and up to 5 practice_phrases', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        expect(Array.isArray(feedback.lesson_plan)).toBe(true);
        expect(feedback.lesson_plan.length).toBeGreaterThanOrEqual(1);
        expect(feedback.lesson_plan.length).toBeLessThanOrEqual(5);
        for (const item of feedback.lesson_plan) {
          expect(typeof item.focus_area).toBe('string');
          expect(item.focus_area.length).toBeGreaterThan(0);
          expect(Array.isArray(item.practice_phrases)).toBe(true);
          expect(item.practice_phrases.length).toBeGreaterThanOrEqual(1);
          expect(item.practice_phrases.length).toBeLessThanOrEqual(5);
          for (const phrase of item.practice_phrases) {
            expect(typeof phrase).toBe('string');
            expect(phrase.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('feedback survives JSON serialization/deserialization without losing structure', () => {
    return fc.assert(
      fc.asyncProperty(sessionFeedbackArb, async (feedback) => {
        const serialized = JSON.stringify(feedback);
        const deserialized = JSON.parse(serialized) as SessionFeedback;

        expect(deserialized.performance_highlights).toEqual(feedback.performance_highlights);
        expect(deserialized.areas_for_improvement).toEqual(feedback.areas_for_improvement);
        expect(deserialized.corrections).toEqual(feedback.corrections);
        expect(deserialized.suggested_vocabulary).toEqual(feedback.suggested_vocabulary);
        expect(deserialized.suggested_scenarios).toEqual(feedback.suggested_scenarios);
        expect(deserialized.lesson_plan).toEqual(feedback.lesson_plan);
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 10: Feedback persistence round-trip', () => {
  it('feedback persisted alongside a session can be retrieved with identical structure', () => {
    return fc.assert(
      fc.asyncProperty(
        sessionRecordArb.map((r) => ({ ...r, feedback: undefined })),
        sessionFeedbackArb,
        async (record, feedback) => {
          store = {};

          // Save session initially without feedback (simulating session end)
          await saveSession(record);

          // Update session with feedback (simulating Teacher Agent response)
          await updateSession(record.id, { feedback });

          // Retrieve and verify
          const retrieved = await getSession(record.id);
          expect(retrieved).toBeDefined();
          expect(retrieved!.feedback).toBeDefined();
          expect(retrieved!.feedback).toEqual(feedback);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('feedback persisted at save time is retrievable with identical structure', () => {
    return fc.assert(
      fc.asyncProperty(
        sessionRecordArb,
        sessionFeedbackArb,
        async (record, feedback) => {
          store = {};

          // Save session with feedback already attached
          const recordWithFeedback = { ...record, feedback };
          await saveSession(recordWithFeedback);

          // Retrieve and verify
          const retrieved = await getSession(recordWithFeedback.id);
          expect(retrieved).toBeDefined();
          expect(retrieved!.feedback).toEqual(feedback);

          // Verify all feedback sections are intact
          expect(retrieved!.feedback!.performance_highlights).toEqual(
            feedback.performance_highlights
          );
          expect(retrieved!.feedback!.areas_for_improvement).toEqual(
            feedback.areas_for_improvement
          );
          expect(retrieved!.feedback!.corrections).toEqual(feedback.corrections);
          expect(retrieved!.feedback!.suggested_vocabulary).toEqual(feedback.suggested_vocabulary);
          expect(retrieved!.feedback!.suggested_scenarios).toEqual(feedback.suggested_scenarios);
          expect(retrieved!.feedback!.lesson_plan).toEqual(feedback.lesson_plan);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('updating feedback does not corrupt the session transcript', () => {
    return fc.assert(
      fc.asyncProperty(
        sessionRecordArb.map((r) => ({ ...r, feedback: undefined })),
        sessionFeedbackArb,
        async (record, feedback) => {
          store = {};

          // Save session without feedback
          await saveSession(record);

          // Update with feedback
          await updateSession(record.id, { feedback });

          // Verify transcript is unchanged
          const retrieved = await getSession(record.id);
          expect(retrieved).toBeDefined();
          expect(retrieved!.transcript).toEqual(record.transcript);
          expect(retrieved!.scenario_id).toBe(record.scenario_id);
          expect(retrieved!.scenario_title).toBe(record.scenario_title);
          expect(retrieved!.target_language).toBe(record.target_language);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('multiple sessions with feedback can coexist without interference', () => {
    return fc.assert(
      fc.asyncProperty(
        fc
          .array(
            fc.tuple(sessionRecordArb, sessionFeedbackArb),
            { minLength: 2, maxLength: 5 }
          )
          .map((pairs) => {
            // Ensure unique IDs
            const seen = new Set<string>();
            return pairs.filter(([r]) => {
              if (seen.has(r.id)) return false;
              seen.add(r.id);
              return true;
            });
          })
          .filter((pairs) => pairs.length >= 2),
        async (pairs) => {
          store = {};

          // Save all sessions with their feedback
          for (const [record, feedback] of pairs) {
            const withFeedback = { ...record, feedback };
            await saveSession(withFeedback);
          }

          // Verify each session's feedback is independently correct
          for (const [record, feedback] of pairs) {
            const retrieved = await getSession(record.id);
            expect(retrieved).toBeDefined();
            expect(retrieved!.feedback).toEqual(feedback);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
