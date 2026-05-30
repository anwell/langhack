/**
 * Property-based tests for session persistence.
 *
 * **Validates: Requirements 4.3, 4.4, 8.4, 8.5, 8.9, 10.14**
 *
 * Property 5: Session record persistence round-trip
 * Property 6: Transcript history reverse chronological ordering
 * Property 7: Local transcript persistence invariant
 * Property 11: Conditional data-driven display
 */

import * as fc from 'fast-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession, getSessions, getSession, updateSession } from '../services/StorageService';
import { SessionRecord, TranscriptEntry, SessionFeedback } from '../types/index';

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

const transcriptEntryArb: fc.Arbitrary<TranscriptEntry> = fc.record({
  role: fc.constantFrom<'user' | 'assistant'>('user', 'assistant'),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
    d.toISOString()
  ),
});

const sessionFeedbackArb: fc.Arbitrary<SessionFeedback> = fc.record({
  session_score: fc.integer({ min: 0, max: 100 }),
  session_pass_fail: fc.constantFrom<'pass' | 'fail'>('pass', 'fail'),
  performance_highlights: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
  areas_for_improvement: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
  corrections: fc.array(
    fc.record({
      original: fc.string({ minLength: 1 }),
      corrected: fc.string({ minLength: 1 }),
      explanation: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    }),
    { minLength: 0, maxLength: 3 }
  ),
  suggested_vocabulary: fc.array(
    fc.record({
      phrase: fc.string({ minLength: 1 }),
      translation: fc.string({ minLength: 1 }),
      context: fc.string({ minLength: 1 }),
    }),
    { minLength: 0, maxLength: 3 }
  ),
  suggested_scenarios: fc.array(
    fc.record({
      id: fc.option(fc.uuid(), { nil: undefined }),
      title: fc.string({ minLength: 1 }),
      description: fc.string({ minLength: 1 }),
      rationale: fc.string({ minLength: 1 }),
    }),
    { minLength: 1, maxLength: 3 }
  ),
  lesson_plan: fc.array(
    fc.record({
      focus_area: fc.string({ minLength: 1 }),
      practice_phrases: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    }),
    { minLength: 1, maxLength: 5 }
  ),
});

const sessionRecordArb: fc.Arbitrary<SessionRecord> = fc.record({
  id: fc.uuid(),
  scenario_id: fc.uuid(),
  scenario_title: fc.string({ minLength: 1, maxLength: 50 }),
  target_language: fc.constantFrom('es', 'fr', 'de', 'it', 'ja', 'ko'),
  started_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
    d.toISOString()
  ),
  ended_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
    d.toISOString()
  ),
  transcript: fc.array(transcriptEntryArb, { minLength: 1, maxLength: 10 }),
  box_file_url: fc.option(fc.webUrl(), { nil: undefined }),
  feedback: fc.option(sessionFeedbackArb, { nil: undefined }),
});

/**
 * Generate a list of session records with unique IDs and distinct started_at timestamps.
 */
const uniqueSessionsArb: fc.Arbitrary<SessionRecord[]> = fc
  .array(sessionRecordArb, { minLength: 2, maxLength: 10 })
  .map((sessions) => {
    // Ensure unique IDs
    const seen = new Set<string>();
    const unique: SessionRecord[] = [];
    for (const s of sessions) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    // Ensure distinct started_at timestamps by offsetting
    return unique.map((s, i) => ({
      ...s,
      started_at: new Date(new Date(s.started_at).getTime() + i * 1000).toISOString(),
    }));
  })
  .filter((sessions) => sessions.length >= 2);

// --- Tests ---

beforeEach(() => {
  store = {};
  jest.clearAllMocks();
});

describe('Property 5: Session record persistence round-trip', () => {
  it('saving and retrieving a session record produces an equivalent record', () => {
    return fc.assert(
      fc.asyncProperty(sessionRecordArb, async (record) => {
        store = {};

        await saveSession(record);
        const retrieved = await getSession(record.id);

        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe(record.id);
        expect(retrieved!.scenario_id).toBe(record.scenario_id);
        expect(retrieved!.scenario_title).toBe(record.scenario_title);
        expect(retrieved!.target_language).toBe(record.target_language);
        expect(retrieved!.started_at).toBe(record.started_at);
        expect(retrieved!.ended_at).toBe(record.ended_at);
        expect(retrieved!.transcript).toEqual(record.transcript);
        expect(retrieved!.box_file_url).toBe(record.box_file_url);
        expect(retrieved!.feedback).toEqual(record.feedback);
      }),
      { numRuns: 100 }
    );
  });

  it('saving multiple sessions preserves all records', () => {
    return fc.assert(
      fc.asyncProperty(uniqueSessionsArb, async (sessions) => {
        store = {};

        for (const session of sessions) {
          await saveSession(session);
        }

        const allSessions = await getSessions();
        expect(allSessions.length).toBe(sessions.length);

        for (const session of sessions) {
          const found = allSessions.find((s) => s.id === session.id);
          expect(found).toBeDefined();
          expect(found!.transcript).toEqual(session.transcript);
        }
      }),
      { numRuns: 50 }
    );
  });
});

describe('Property 6: Transcript history reverse chronological ordering', () => {
  it('sessions are always returned in reverse chronological order by started_at', () => {
    return fc.assert(
      fc.asyncProperty(uniqueSessionsArb, async (sessions) => {
        store = {};

        // Save sessions in random order
        for (const session of sessions) {
          await saveSession(session);
        }

        const retrieved = await getSessions();

        // Verify reverse chronological ordering
        for (let i = 0; i < retrieved.length - 1; i++) {
          const currentTime = new Date(retrieved[i].started_at).getTime();
          const nextTime = new Date(retrieved[i + 1].started_at).getTime();
          expect(currentTime).toBeGreaterThanOrEqual(nextTime);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('adding a new session maintains reverse chronological order', () => {
    return fc.assert(
      fc.asyncProperty(uniqueSessionsArb, sessionRecordArb, async (sessions, newSession) => {
        store = {};

        for (const session of sessions) {
          await saveSession(session);
        }

        // Add a new session with a unique ID
        const uniqueNew = { ...newSession, id: 'new-unique-' + newSession.id };
        await saveSession(uniqueNew);

        const retrieved = await getSessions();

        // Verify ordering is still maintained
        for (let i = 0; i < retrieved.length - 1; i++) {
          const currentTime = new Date(retrieved[i].started_at).getTime();
          const nextTime = new Date(retrieved[i + 1].started_at).getTime();
          expect(currentTime).toBeGreaterThanOrEqual(nextTime);
        }
      }),
      { numRuns: 50 }
    );
  });
});

describe('Property 7: Local transcript persistence invariant', () => {
  it('transcript is persisted locally regardless of box_file_url presence', () => {
    return fc.assert(
      fc.asyncProperty(sessionRecordArb, async (record) => {
        store = {};

        // Save session (simulating end of session - local persistence happens first)
        await saveSession(record);

        // Verify transcript is persisted regardless of box_file_url
        const retrieved = await getSession(record.id);
        expect(retrieved).toBeDefined();
        expect(retrieved!.transcript).toEqual(record.transcript);
        expect(retrieved!.transcript.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('transcript remains persisted even after updating box_file_url (simulating upload success/failure)', () => {
    return fc.assert(
      fc.asyncProperty(
        sessionRecordArb,
        fc.option(fc.webUrl(), { nil: undefined }),
        async (record, boxUrl) => {
          store = {};

          // Save session without box URL first (simulating immediate local persistence)
          const recordWithoutBox = { ...record, box_file_url: undefined };
          await saveSession(recordWithoutBox);

          // Simulate upload outcome by updating the session
          if (boxUrl) {
            await updateSession(record.id, { box_file_url: boxUrl });
          }
          // If boxUrl is undefined, simulates upload failure - no update

          // Verify transcript is always present regardless of upload outcome
          const retrieved = await getSession(record.id);
          expect(retrieved).toBeDefined();
          expect(retrieved!.transcript).toEqual(record.transcript);
          expect(retrieved!.transcript.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('transcript persists even when feedback update fails (feedback remains undefined)', () => {
    return fc.assert(
      fc.asyncProperty(sessionRecordArb, async (record) => {
        store = {};

        // Save session without feedback (simulating Teacher Agent failure)
        const recordNoFeedback = { ...record, feedback: undefined, box_file_url: undefined };
        await saveSession(recordNoFeedback);

        // Verify transcript is still there
        const retrieved = await getSession(record.id);
        expect(retrieved).toBeDefined();
        expect(retrieved!.transcript).toEqual(record.transcript);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: Conditional data-driven display', () => {
  /**
   * Helper that simulates the display logic from HistoryScreen:
   * - "View in Box" link shown iff box_file_url exists
   * - "View Feedback" option shown iff feedback exists
   */
  function shouldShowViewInBox(record: SessionRecord): boolean {
    return record.box_file_url !== undefined && record.box_file_url !== null;
  }

  function shouldShowViewFeedback(record: SessionRecord): boolean {
    return record.feedback !== undefined && record.feedback !== null;
  }

  it('"View in Box" is shown if and only if box_file_url exists', () => {
    return fc.assert(
      fc.asyncProperty(sessionRecordArb, async (record) => {
        store = {};
        await saveSession(record);

        const retrieved = await getSession(record.id);
        expect(retrieved).toBeDefined();

        const showBox = shouldShowViewInBox(retrieved!);

        if (retrieved!.box_file_url) {
          expect(showBox).toBe(true);
        } else {
          expect(showBox).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('"View Feedback" is shown if and only if feedback exists', () => {
    return fc.assert(
      fc.asyncProperty(sessionRecordArb, async (record) => {
        store = {};
        await saveSession(record);

        const retrieved = await getSession(record.id);
        expect(retrieved).toBeDefined();

        const showFeedback = shouldShowViewFeedback(retrieved!);

        if (retrieved!.feedback) {
          expect(showFeedback).toBe(true);
        } else {
          expect(showFeedback).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('records with box_file_url always show "View in Box", records without never do', () => {
    const withBoxUrl = sessionRecordArb.map((r) => ({
      ...r,
      box_file_url: 'https://app.box.com/file/' + r.id,
    }));
    const withoutBoxUrl = sessionRecordArb.map((r) => ({
      ...r,
      box_file_url: undefined,
    }));

    return fc.assert(
      fc.asyncProperty(withBoxUrl, withoutBoxUrl, async (withUrl, withoutUrl) => {
        store = {};

        await saveSession(withUrl);
        await saveSession(withoutUrl);

        const retrievedWith = await getSession(withUrl.id);
        const retrievedWithout = await getSession(withoutUrl.id);

        expect(shouldShowViewInBox(retrievedWith!)).toBe(true);
        expect(shouldShowViewInBox(retrievedWithout!)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  it('records with feedback always show "View Feedback", records without never do', () => {
    const withFeedback = fc.tuple(sessionRecordArb, sessionFeedbackArb).map(([r, f]) => ({
      ...r,
      feedback: f,
    }));
    const withoutFeedback = sessionRecordArb.map((r) => ({
      ...r,
      feedback: undefined,
    }));

    return fc.assert(
      fc.asyncProperty(withFeedback, withoutFeedback, async (withFb, withoutFb) => {
        store = {};

        await saveSession(withFb);
        await saveSession(withoutFb);

        const retrievedWith = await getSession(withFb.id);
        const retrievedWithout = await getSession(withoutFb.id);

        expect(shouldShowViewFeedback(retrievedWith!)).toBe(true);
        expect(shouldShowViewFeedback(retrievedWithout!)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});
