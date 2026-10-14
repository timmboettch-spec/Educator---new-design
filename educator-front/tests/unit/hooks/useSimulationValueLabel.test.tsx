import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import i18n from '../../../src/i18n';
import {
  useSimulationDurationLabel,
  useSimulationValueLabel,
} from '../../../src/hooks/useSimulationValueLabel';

describe('useSimulationValueLabel', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('translates known values case-insensitively', () => {
    const { result } = renderHook(() => useSimulationValueLabel());
    expect(result.current('Post-Secondary')).toBe('Post-Secondary');
    expect(result.current('easy')).toBe('Easy');
    expect(result.current(' HARD ')).toBe('Hard');
    expect(result.current('Avatar')).toBe('Avatar');
  });

  it('returns unknown values unchanged', () => {
    const { result } = renderHook(() => useSimulationValueLabel());
    expect(result.current('BSN Nursing')).toBe('BSN Nursing');
    expect(result.current('')).toBe('');
  });

  it('follows the active language', async () => {
    const { result } = renderHook(() => useSimulationValueLabel());
    await act(() => i18n.changeLanguage('es'));
    expect(result.current('Easy')).toBe('Fácil');
    expect(result.current('Secondary')).toBe('Secundaria');
    expect(result.current('Workstation')).toBe('Estación de trabajo');
  });
});

describe('useSimulationDurationLabel', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('leaves English durations as they are', () => {
    const { result } = renderHook(() => useSimulationDurationLabel());
    expect(result.current('20 minutes')).toBe('20 minutes');
    expect(result.current('<15 min')).toBe('<15 min');
  });

  it('translates unit words in Spanish', async () => {
    const { result } = renderHook(() => useSimulationDurationLabel());
    await act(() => i18n.changeLanguage('es'));
    expect(result.current('20 minutes')).toBe('20 minutos');
    expect(result.current('1 minute')).toBe('1 minuto');
    expect(result.current('2 hours')).toBe('2 horas');
    expect(result.current('15-20 Minutes')).toBe('15-20 minutos');
  });
});
