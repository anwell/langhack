/**
 * Property-based tests for score color mapping.
 *
 * **Validates: Requirements 12.4, 12.5, 12.6**
 *
 * Property 20: Score color mapping correctness
 * - Scores >= 80 always return green (#16a34a)
 * - Scores 60-79 always return yellow/amber (#d97706)
 * - Scores < 60 always return red (#dc2626)
 */

import * as fc from 'fast-check';

// Mock React Native modules to allow importing from PostSessionScreen
jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn(() => ({ value: 0 })),
  withTiming: jest.fn((val: number) => val),
  Easing: { out: jest.fn(() => jest.fn()), cubic: jest.fn() },
  useAnimatedReaction: jest.fn(),
  runOnJS: jest.fn((fn: Function) => fn),
}));

jest.mock('../services/StorageService', () => ({
  getCachedScenarios: jest.fn(async () => []),
  getLanguageSettings: jest.fn(async () => ({ target_language: 'es', source_language: 'en' })),
  saveSession: jest.fn(async () => {}),
  updateSession: jest.fn(async () => {}),
}));

jest.mock('../services/ApiService', () => ({
  requestFeedback: jest.fn(async () => null),
  uploadTranscript: jest.fn(async () => ''),
}));

jest.mock('../components/PassFailBadge', () => ({
  PassFailBadge: 'PassFailBadge',
}));

import { getScoreColor } from '../screens/PostSessionScreen';

describe('Property 20: Score color mapping correctness', () => {
  it('scores >= 80 always return green (#16a34a)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 80, max: 100 }), (score) => {
        expect(getScoreColor(score)).toBe('#16a34a');
      }),
      { numRuns: 200 }
    );
  });

  it('scores 60-79 always return yellow/amber (#d97706)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 79 }), (score) => {
        expect(getScoreColor(score)).toBe('#d97706');
      }),
      { numRuns: 200 }
    );
  });

  it('scores < 60 always return red (#dc2626)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 59 }), (score) => {
        expect(getScoreColor(score)).toBe('#dc2626');
      }),
      { numRuns: 200 }
    );
  });

  it('every score in 0-100 maps to exactly one of the three colors', () => {
    const validColors = ['#16a34a', '#d97706', '#dc2626'];

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        const color = getScoreColor(score);
        expect(validColors).toContain(color);
      }),
      { numRuns: 200 }
    );
  });

  it('boundary values map correctly (60 is amber, 80 is green)', () => {
    expect(getScoreColor(0)).toBe('#dc2626');
    expect(getScoreColor(59)).toBe('#dc2626');
    expect(getScoreColor(60)).toBe('#d97706');
    expect(getScoreColor(79)).toBe('#d97706');
    expect(getScoreColor(80)).toBe('#16a34a');
    expect(getScoreColor(100)).toBe('#16a34a');
  });
});
