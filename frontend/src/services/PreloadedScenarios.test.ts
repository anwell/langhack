import { PRELOADED_SCENARIOS } from './PreloadedScenarios';

describe('PreloadedScenarios', () => {
  it('includes multiple default scenarios for each supported target language', () => {
    const counts = PRELOADED_SCENARIOS.reduce<Record<string, number>>((acc, scenario) => {
      acc[scenario.target_language] = (acc[scenario.target_language] || 0) + 1;
      return acc;
    }, {});

    expect(counts.es).toBeGreaterThanOrEqual(5);
    expect(counts.fr).toBeGreaterThanOrEqual(5);
  });

  it('uses unique IDs and valid display fields', () => {
    const ids = PRELOADED_SCENARIOS.map((scenario) => scenario.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of PRELOADED_SCENARIOS) {
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeLessThanOrEqual(150);
      expect(scenario.system_prompt.length).toBeGreaterThan(0);
      expect(scenario.source).toBe('preloaded');
    }
  });

  it('has vocabulary prompts for every default scenario', () => {
    for (const scenario of PRELOADED_SCENARIOS) {
      expect(scenario.key_vocabulary?.length).toBeGreaterThanOrEqual(3);
    }
  });
});
