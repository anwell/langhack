import { DEFAULT_LANGUAGE_SETTINGS } from './StorageService';

describe('StorageService defaults', () => {
  it('defaults the target practice language to Spanish', () => {
    expect(DEFAULT_LANGUAGE_SETTINGS.target_language).toBe('es');
  });

  it('defaults the feedback/source language to English', () => {
    expect(DEFAULT_LANGUAGE_SETTINGS.source_language).toBe('en');
  });
});
