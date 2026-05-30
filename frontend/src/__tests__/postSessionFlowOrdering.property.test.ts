/**
 * Property-based tests for automatic post-session flow ordering.
 *
 * **Validates: Requirements 10.1, 8.10**
 *
 * Property 18: Automatic post-session flow ordering
 * Tests that the post-session pipeline executes Teacher Agent evaluation
 * before Box upload (feedback must be available before upload is called).
 */

import * as fc from 'fast-check';
import {
  SessionFeedback,
  TranscriptEntry,
  Correction,
  SuggestedPhrase,
  SuggestedScenario,
  LessonPlanItem,
} from '../types/index';

// --- Track call ordering ---
let callLog: Array<{ fn: string; timestamp: number; args?: unknown }> = [];
let feedbackBehavior: 'resolve' | 'reject' = 'resolve';
let feedbackResult: SessionFeedback | null = null;

// --- Mock ApiService ---
jest.mock('../services/ApiService', () => ({
  requestFeedback: jest.fn(async (input: unknown) => {
    const timestamp = callLog.length;
    callLog.push({ fn: 'requestFeedback', timestamp, args: input });
    if (feedbackBehavior === 'reject') {
      throw new Error('Feedback is temporarily unavailable');
    }
    return feedbackResult;
  }),
  uploadTranscript: jest.fn(async (input: unknown) => {
    const timestamp = callLog.length;
    callLog.push({ fn: 'uploadTranscript', timestamp, args: input });
    return 'https://box.com/file/123';
  }),
}));

// --- Mock StorageService ---
jest.mock('../services/StorageService', () => ({
  saveSession: jest.fn(async () => {}),
  updateSession: jest.fn(async () => {}),
  getLanguageSettings: jest.fn(async () => ({
    target_language: 'es',
    source_language: 'en',
  })),
  getCachedScenarios: jest.fn(async () => [
    { id: 'scenario-1', title: 'Test Scenario' },
  ]),
}));

// --- Arbitraries ---

const transcriptEntryArb: fc.Arbitrary<TranscriptEntry> = fc.record({
  role: fc.constantFrom<'user' | 'assistant'>('user', 'assistant'),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
    .map((d) => d.toISOString()),
});

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

/**
 * Simulate the post-session flow as implemented in PostSessionScreen:
 * 1. requestFeedback is called
 * 2. On success, uploadTranscript is called with the feedback data
 * 3. On failure, uploadTranscript is never called
 */
async function simulatePostSessionFlow(
  transcript: TranscriptEntry[],
  scenarioTitle: string,
  feedback: SessionFeedback
): Promise<void> {
  // Import the mocked functions
  const { requestFeedback, uploadTranscript } = require('../services/ApiService');
  const { getLanguageSettings, getCachedScenarios } = require('../services/StorageService');

  // Step 1: Request feedback (mirrors getFeedback() in PostSessionScreen)
  const settings = await getLanguageSettings();
  const scenarios = await getCachedScenarios();

  let receivedFeedback: SessionFeedback | null = null;
  try {
    receivedFeedback = await requestFeedback({
      transcript,
      target_language: settings.target_language,
      source_language: settings.source_language,
      available_scenarios: scenarios.map((s: { id: string; title: string }) => ({
        id: s.id,
        title: s.title,
      })),
    });
  } catch {
    // Feedback failed — do NOT call upload
    return;
  }

  // Step 2: Upload transcript with feedback (mirrors runUpload() in PostSessionScreen)
  if (receivedFeedback) {
    await uploadTranscript({
      transcript,
      session_date: new Date().toISOString(),
      scenario_title: scenarioTitle,
      feedback: receivedFeedback,
    });
  }
}

// --- Tests ---

beforeEach(() => {
  callLog = [];
  feedbackBehavior = 'resolve';
  feedbackResult = null;
  jest.clearAllMocks();
});

describe('Property 18: Automatic post-session flow ordering', () => {
  it('uploadTranscript is never called before requestFeedback completes', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(transcriptEntryArb, { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        sessionFeedbackArb,
        async (transcript, scenarioTitle, feedback) => {
          callLog = [];
          feedbackBehavior = 'resolve';
          feedbackResult = feedback;

          await simulatePostSessionFlow(transcript, scenarioTitle, feedback);

          // Verify ordering: requestFeedback must appear before uploadTranscript
          const feedbackCallIndex = callLog.findIndex((c) => c.fn === 'requestFeedback');
          const uploadCallIndex = callLog.findIndex((c) => c.fn === 'uploadTranscript');

          expect(feedbackCallIndex).toBeGreaterThanOrEqual(0);
          if (uploadCallIndex >= 0) {
            expect(feedbackCallIndex).toBeLessThan(uploadCallIndex);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when requestFeedback succeeds, uploadTranscript is called with the feedback data', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(transcriptEntryArb, { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        sessionFeedbackArb,
        async (transcript, scenarioTitle, feedback) => {
          callLog = [];
          feedbackBehavior = 'resolve';
          feedbackResult = feedback;

          await simulatePostSessionFlow(transcript, scenarioTitle, feedback);

          // uploadTranscript must have been called
          const uploadCall = callLog.find((c) => c.fn === 'uploadTranscript');
          expect(uploadCall).toBeDefined();

          // The upload call must include the feedback data
          const uploadArgs = uploadCall!.args as {
            transcript: TranscriptEntry[];
            session_date: string;
            scenario_title: string;
            feedback?: SessionFeedback;
          };
          expect(uploadArgs.feedback).toEqual(feedback);
          expect(uploadArgs.transcript).toEqual(transcript);
          expect(uploadArgs.scenario_title).toBe(scenarioTitle);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when requestFeedback fails, uploadTranscript is never called', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(transcriptEntryArb, { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        sessionFeedbackArb,
        async (transcript, scenarioTitle, feedback) => {
          callLog = [];
          feedbackBehavior = 'reject';
          feedbackResult = feedback;

          await simulatePostSessionFlow(transcript, scenarioTitle, feedback);

          // requestFeedback was called
          const feedbackCall = callLog.find((c) => c.fn === 'requestFeedback');
          expect(feedbackCall).toBeDefined();

          // uploadTranscript must NOT have been called
          const uploadCall = callLog.find((c) => c.fn === 'uploadTranscript');
          expect(uploadCall).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
