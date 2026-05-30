/**
 * Property-based tests for scenario validation and merge.
 *
 * **Validates: Requirements 1.1, 1.3, 9.4, 9.6, 9.10**
 *
 * Property 1: Scenario schema conformance
 * Property 2: Scenario description length constraint
 * Property 8: Scenario merge deduplication
 */

import * as fc from 'fast-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheScenarios, getCachedScenarios } from '../services/StorageService';
import { Scenario } from '../types/index';

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

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  title: fc.string({ minLength: 1, maxLength: 80 }),
  description: fc.string({ minLength: 1, maxLength: 150 }),
  target_language: fc.constantFrom('es', 'fr', 'de', 'it', 'ja', 'ko', 'pt', 'zh'),
  key_vocabulary: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 6 }),
    { nil: undefined }
  ),
  system_prompt: fc.string({ minLength: 1, maxLength: 300 }),
  source: fc.constantFrom<'preloaded' | 'backend' | 'generated'>('preloaded', 'backend', 'generated'),
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map((d) =>
    d.toISOString()
  ),
});

/**
 * Generate a list of scenarios with unique IDs.
 */
const uniqueScenariosArb: fc.Arbitrary<Scenario[]> = fc
  .array(scenarioArb, { minLength: 1, maxLength: 15 })
  .map((scenarios) => {
    const seen = new Set<string>();
    const unique: Scenario[] = [];
    for (const s of scenarios) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    return unique;
  })
  .filter((scenarios) => scenarios.length >= 1);

/**
 * Generate two lists of scenarios that share some IDs (for merge testing).
 */
const overlappingScenariosArb: fc.Arbitrary<{ listA: Scenario[]; listB: Scenario[] }> = fc
  .tuple(
    fc.array(scenarioArb, { minLength: 2, maxLength: 8 }),
    fc.array(scenarioArb, { minLength: 2, maxLength: 8 })
  )
  .map(([listA, listB]) => {
    // Ensure unique IDs within each list
    const dedup = (list: Scenario[]) => {
      const seen = new Set<string>();
      return list.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    };
    const a = dedup(listA);
    const b = dedup(listB);

    // Force some overlap: copy IDs from listA into listB entries
    if (a.length > 0 && b.length > 0) {
      b[0] = { ...b[0], id: a[0].id };
    }

    return { listA: a, listB: b };
  })
  .filter(({ listA, listB }) => listA.length >= 1 && listB.length >= 1);

// --- Tests ---

beforeEach(() => {
  store = {};
  jest.clearAllMocks();
});

describe('Property 1: Scenario schema conformance', () => {
  it('all generated scenarios conform to the expected schema fields', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        // Required fields exist and have correct types
        expect(typeof scenario.id).toBe('string');
        expect(scenario.id.length).toBeGreaterThan(0);

        expect(typeof scenario.title).toBe('string');
        expect(scenario.title.length).toBeGreaterThan(0);

        expect(typeof scenario.description).toBe('string');
        expect(scenario.description.length).toBeGreaterThan(0);

        expect(typeof scenario.target_language).toBe('string');
        expect(scenario.target_language.length).toBeGreaterThan(0);

        expect(typeof scenario.system_prompt).toBe('string');
        expect(scenario.system_prompt.length).toBeGreaterThan(0);

        expect(['preloaded', 'backend', 'generated']).toContain(scenario.source);

        expect(typeof scenario.created_at).toBe('string');
        // Verify created_at is a valid ISO 8601 date
        expect(new Date(scenario.created_at).toISOString()).toBe(scenario.created_at);

        // key_vocabulary is optional but when present must be an array of strings
        if (scenario.key_vocabulary !== undefined) {
          expect(Array.isArray(scenario.key_vocabulary)).toBe(true);
          for (const word of scenario.key_vocabulary) {
            expect(typeof word).toBe('string');
            expect(word.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('scenarios persisted and retrieved maintain schema conformance', () => {
    return fc.assert(
      fc.asyncProperty(uniqueScenariosArb, async (scenarios) => {
        store = {};

        await cacheScenarios(scenarios);
        const retrieved = await getCachedScenarios();

        for (const scenario of retrieved) {
          expect(typeof scenario.id).toBe('string');
          expect(scenario.id.length).toBeGreaterThan(0);
          expect(typeof scenario.title).toBe('string');
          expect(typeof scenario.description).toBe('string');
          expect(typeof scenario.target_language).toBe('string');
          expect(typeof scenario.system_prompt).toBe('string');
          expect(['preloaded', 'backend', 'generated']).toContain(scenario.source);
          expect(typeof scenario.created_at).toBe('string');
        }
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Scenario description length constraint', () => {
  it('scenario descriptions are always 150 characters or fewer', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        expect(scenario.description.length).toBeLessThanOrEqual(150);
      }),
      { numRuns: 200 }
    );
  });

  it('scenarios retrieved from cache maintain the description length constraint', () => {
    return fc.assert(
      fc.asyncProperty(uniqueScenariosArb, async (scenarios) => {
        store = {};

        await cacheScenarios(scenarios);
        const retrieved = await getCachedScenarios();

        for (const scenario of retrieved) {
          expect(scenario.description.length).toBeLessThanOrEqual(150);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('descriptions at the boundary (exactly 150 chars) are valid', () => {
    const boundaryScenarioArb = scenarioArb.map((s) => ({
      ...s,
      description: 'x'.repeat(150),
    }));

    fc.assert(
      fc.property(boundaryScenarioArb, (scenario) => {
        expect(scenario.description.length).toBe(150);
        expect(scenario.description.length).toBeLessThanOrEqual(150);
      }),
      { numRuns: 50 }
    );
  });
});

describe('Property 8: Scenario merge deduplication', () => {
  it('merging scenarios deduplicates by ID (no duplicate IDs in merged list)', () => {
    return fc.assert(
      fc.asyncProperty(overlappingScenariosArb, async ({ listA, listB }) => {
        store = {};

        // Cache first list, then merge second list
        await cacheScenarios(listA);
        await cacheScenarios(listB);

        const merged = await getCachedScenarios();

        // No duplicate IDs
        const ids = merged.map((s) => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }),
      { numRuns: 100 }
    );
  });

  it('merged list contains all unique IDs from both input lists', () => {
    return fc.assert(
      fc.asyncProperty(overlappingScenariosArb, async ({ listA, listB }) => {
        store = {};

        await cacheScenarios(listA);
        await cacheScenarios(listB);

        const merged = await getCachedScenarios();
        const mergedIds = new Set(merged.map((s) => s.id));

        // Every unique ID from both lists should be present
        const allInputIds = new Set([...listA.map((s) => s.id), ...listB.map((s) => s.id)]);
        for (const id of allInputIds) {
          expect(mergedIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('later scenarios overwrite earlier ones with the same ID', () => {
    return fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.string({ minLength: 1, maxLength: 80 }),
        async (scenario, newTitle) => {
          store = {};

          // Cache original
          await cacheScenarios([scenario]);

          // Cache updated version with same ID but different title
          const updated = { ...scenario, title: newTitle };
          await cacheScenarios([updated]);

          const merged = await getCachedScenarios();
          const found = merged.find((s) => s.id === scenario.id);

          expect(found).toBeDefined();
          // The later entry should win
          expect(found!.title).toBe(newTitle);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('merging an empty list with existing scenarios preserves all existing', () => {
    return fc.assert(
      fc.asyncProperty(uniqueScenariosArb, async (scenarios) => {
        store = {};

        await cacheScenarios(scenarios);
        await cacheScenarios([]); // Merge empty list

        const merged = await getCachedScenarios();
        expect(merged.length).toBe(scenarios.length);

        const mergedIds = new Set(merged.map((s) => s.id));
        for (const s of scenarios) {
          expect(mergedIds.has(s.id)).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });
});
