/**
 * Property-based tests for achievement milestone detection.
 *
 * **Validates: Requirements 12.10, 12.11**
 *
 * Property 21: Achievement milestone detection correctness
 * - evaluateAchievements() correctly detects milestones at the right thresholds
 * - Each milestone is awarded at most once
 */

import * as fc from 'fast-check';
import { evaluateAchievements, AchievementState, AchievementRecord, MilestoneId } from '../services/AchievementService';

// --- Arbitraries ---

const milestoneIdArb: fc.Arbitrary<MilestoneId> = fc.constantFrom(
  'first-session',
  'streak-3',
  'streak-5',
  'perfect-score',
  'ten-sessions'
);

const achievementRecordArb: fc.Arbitrary<AchievementRecord> = fc.record({
  id: milestoneIdArb,
  label: fc.string({ minLength: 1, maxLength: 30 }),
  icon: fc.constantFrom('🎯', '🔥', '⚡', '💯', '🏆'),
  earned_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
    d.toISOString()
  ),
  session_id: fc.string({ minLength: 0, maxLength: 36 }),
});

const achievementStateArb: fc.Arbitrary<AchievementState> = fc.record({
  total_sessions: fc.integer({ min: 0, max: 100 }),
  current_streak: fc.integer({ min: 0, max: 100 }),
  last_session_date: fc.option(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
      d.toISOString()
    ),
    { nil: null }
  ),
  earned_badges: fc.array(achievementRecordArb, { minLength: 0, maxLength: 5 }),
});

const sessionScoreArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100 });

// --- Tests ---

describe('Property 21: Achievement milestone detection correctness', () => {
  describe('first-session milestone', () => {
    it('is awarded when total_sessions is 1 and not previously earned', () => {
      fc.assert(
        fc.property(sessionScoreArb, (score) => {
          const state: AchievementState = {
            total_sessions: 1,
            current_streak: 1,
            last_session_date: new Date().toISOString(),
            earned_badges: [],
          };

          const badges = evaluateAchievements(score, state);
          const firstSession = badges.find((b) => b.id === 'first-session');
          expect(firstSession).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('is NOT awarded when total_sessions is greater than 1', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 100 }),
          sessionScoreArb,
          (totalSessions, score) => {
            const state: AchievementState = {
              total_sessions: totalSessions,
              current_streak: 1,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const firstSession = badges.find((b) => b.id === 'first-session');
            expect(firstSession).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('streak-3 milestone', () => {
    it('is awarded when current_streak >= 3 and not previously earned', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 100 }),
          sessionScoreArb,
          (streak, score) => {
            const state: AchievementState = {
              total_sessions: streak,
              current_streak: streak,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const streak3 = badges.find((b) => b.id === 'streak-3');
            expect(streak3).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is NOT awarded when current_streak < 3', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2 }),
          sessionScoreArb,
          (streak, score) => {
            const state: AchievementState = {
              total_sessions: 5,
              current_streak: streak,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const streak3 = badges.find((b) => b.id === 'streak-3');
            expect(streak3).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('streak-5 milestone', () => {
    it('is awarded when current_streak >= 5 and not previously earned', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 100 }),
          sessionScoreArb,
          (streak, score) => {
            const state: AchievementState = {
              total_sessions: streak,
              current_streak: streak,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const streak5 = badges.find((b) => b.id === 'streak-5');
            expect(streak5).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is NOT awarded when current_streak < 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 4 }),
          sessionScoreArb,
          (streak, score) => {
            const state: AchievementState = {
              total_sessions: 10,
              current_streak: streak,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const streak5 = badges.find((b) => b.id === 'streak-5');
            expect(streak5).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('perfect-score milestone', () => {
    it('is awarded when sessionScore is exactly 100 and not previously earned', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (totalSessions) => {
            const state: AchievementState = {
              total_sessions: totalSessions,
              current_streak: 1,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(100, state);
            const perfect = badges.find((b) => b.id === 'perfect-score');
            expect(perfect).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is NOT awarded when sessionScore is less than 100', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 99 }),
          (score) => {
            const state: AchievementState = {
              total_sessions: 5,
              current_streak: 3,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const perfect = badges.find((b) => b.id === 'perfect-score');
            expect(perfect).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ten-sessions milestone', () => {
    it('is awarded when total_sessions >= 10 and not previously earned', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          sessionScoreArb,
          (totalSessions, score) => {
            const state: AchievementState = {
              total_sessions: totalSessions,
              current_streak: 1,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const tenSessions = badges.find((b) => b.id === 'ten-sessions');
            expect(tenSessions).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is NOT awarded when total_sessions < 10', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9 }),
          sessionScoreArb,
          (totalSessions, score) => {
            const state: AchievementState = {
              total_sessions: totalSessions,
              current_streak: 1,
              last_session_date: new Date().toISOString(),
              earned_badges: [],
            };

            const badges = evaluateAchievements(score, state);
            const tenSessions = badges.find((b) => b.id === 'ten-sessions');
            expect(tenSessions).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('idempotency: each milestone is awarded at most once', () => {
    it('does not re-award a milestone that already exists in earned_badges', () => {
      fc.assert(
        fc.property(achievementStateArb, sessionScoreArb, (state, score) => {
          const badges = evaluateAchievements(score, state);

          // No badge in the result should have an ID that already exists in earned_badges
          for (const badge of badges) {
            const alreadyEarned = state.earned_badges.some((eb) => eb.id === badge.id);
            expect(alreadyEarned).toBe(false);
          }
        }),
        { numRuns: 200 }
      );
    });

    it('calling evaluateAchievements twice with same state produces same result', () => {
      fc.assert(
        fc.property(achievementStateArb, sessionScoreArb, (state, score) => {
          const badges1 = evaluateAchievements(score, state);
          const badges2 = evaluateAchievements(score, state);

          expect(badges1.map((b) => b.id).sort()).toEqual(badges2.map((b) => b.id).sort());
        }),
        { numRuns: 200 }
      );
    });

    it('after appending new badges to state, re-evaluation does not produce duplicates', () => {
      fc.assert(
        fc.property(achievementStateArb, sessionScoreArb, (state, score) => {
          const badges = evaluateAchievements(score, state);

          // Simulate persisting the new badges
          const updatedState: AchievementState = {
            ...state,
            earned_badges: [...state.earned_badges, ...badges],
          };

          // Re-evaluate with the updated state
          const badgesAfter = evaluateAchievements(score, updatedState);

          // None of the previously awarded badges should appear again
          for (const badge of badges) {
            const reAwarded = badgesAfter.find((b) => b.id === badge.id);
            expect(reAwarded).toBeUndefined();
          }
        }),
        { numRuns: 200 }
      );
    });
  });
});
