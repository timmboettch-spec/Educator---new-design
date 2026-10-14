import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import i18n from '../../../src/i18n';
import { useAuthLanguage } from '../../../src/hooks/useAuthLanguage';

describe('useAuthLanguage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en');
    localStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('starts from the saved language', () => {
    localStorage.setItem('app_language', 'es');
    const { result } = renderHook(() => useAuthLanguage());
    expect(result.current.language).toBe('es');
  });

  it('falls back to the browser language when nothing is saved', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('es-MX');
    const { result } = renderHook(() => useAuthLanguage());
    expect(result.current.language).toBe('es');
  });

  it('defaults to English for an unsupported browser language', () => {
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('fr-FR');
    const { result } = renderHook(() => useAuthLanguage());
    expect(result.current.language).toBe('en');
  });

  it('switching updates i18next in place, <html lang> and the saved choice', async () => {
    const { result } = renderHook(() => useAuthLanguage());

    await act(async () => {
      result.current.setLanguage('es');
    });

    expect(result.current.language).toBe('es');
    expect(i18n.language).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('app_language')).toBe('es');
  });
});
