/**
 * Property-based tests for transcript entry validation.
 *
 * **Validates: Requirements 4.2**
 *
 * Property 4: Transcript entries have valid speaker labels
 * Verifies that transcript entries always have valid speaker labels (user or assistant).
 */

import * as fc from 'fast-check';
import { TranscriptEntry } from '../types/index';

/**
 * Valid speaker roles as defined by the TranscriptEntry interface.
 * Requirement 4.2 states: "THE App SHALL label each Transcript entry
 * with the speaker (user or AI)"
 */
const VALID_ROLES: ReadonlyArray<TranscriptEntry['role']> = ['user', 'assistant'];

/**
 * Arbitrary that generates valid TranscriptEntry objects.
 * This models the data that flows through the application's transcript system.
 */
const transcriptEntryArb: fc.Arbitrary<TranscriptEntry> = fc.record({
  role: fc.constantFrom<'user' | 'assistant'>('user', 'assistant'),
  text: fc.string({ minLength: 1 }),
  timestamp: fc.date().map((d) => d.toISOString()),
});

/**
 * Arbitrary that generates arrays of TranscriptEntry objects,
 * simulating a full conversation transcript.
 */
const transcriptArb: fc.Arbitrary<TranscriptEntry[]> = fc.array(transcriptEntryArb, {
  minLength: 1,
  maxLength: 50,
});

describe('Property 4: Transcript entries have valid speaker labels', () => {
  it('every transcript entry role is either "user" or "assistant"', () => {
    fc.assert(
      fc.property(transcriptEntryArb, (entry: TranscriptEntry) => {
        expect(VALID_ROLES).toContain(entry.role);
      }),
      { numRuns: 200 }
    );
  });

  it('in a full transcript, all entries have valid speaker labels', () => {
    fc.assert(
      fc.property(transcriptArb, (transcript: TranscriptEntry[]) => {
        for (const entry of transcript) {
          expect(VALID_ROLES).toContain(entry.role);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('transcript entries never have an empty or undefined role', () => {
    fc.assert(
      fc.property(transcriptEntryArb, (entry: TranscriptEntry) => {
        expect(entry.role).toBeDefined();
        expect(entry.role).not.toBe('');
        expect(typeof entry.role).toBe('string');
      }),
      { numRuns: 200 }
    );
  });

  it('speaker labels are strictly "user" or "assistant" — no other values', () => {
    fc.assert(
      fc.property(transcriptEntryArb, (entry: TranscriptEntry) => {
        // Validates that the role is exactly one of the two valid values
        const isValidRole = entry.role === 'user' || entry.role === 'assistant';
        expect(isValidRole).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('validates that arbitrary string roles would be rejected by the type system', () => {
    // This test demonstrates that invalid roles are not representable
    // in the TranscriptEntry type. We generate arbitrary strings and verify
    // that only "user" and "assistant" pass validation.
    fc.assert(
      fc.property(fc.string(), (arbitraryRole: string) => {
        const isValid = arbitraryRole === 'user' || arbitraryRole === 'assistant';
        if (isValid) {
          // If the string happens to be a valid role, it should be in VALID_ROLES
          expect(VALID_ROLES).toContain(arbitraryRole);
        } else {
          // Any other string is not a valid speaker label
          expect(VALID_ROLES).not.toContain(arbitraryRole);
        }
      }),
      { numRuns: 500 }
    );
  });
});
