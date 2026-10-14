import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useCatalogView } from '../../../src/hooks/useCatalogView';

const renderView = (url = '/simulation-catalog') =>
  renderHook(() => ({ ...useCatalogView(), search: useLocation().search }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    ),
  });

describe('useCatalogView', () => {
  it('defaults to All', () => {
    expect(renderView().result.current.view).toBe('all');
  });

  it('reads the view from the URL', () => {
    expect(
      renderView('/simulation-catalog?view=units').result.current.view
    ).toBe('units');
  });

  it('falls back to All for an unknown view', () => {
    expect(
      renderView('/simulation-catalog?view=nope').result.current.view
    ).toBe('all');
  });

  it('writes the chosen view to the URL, keeping other params', () => {
    const { result } = renderView('/simulation-catalog?foo=1');

    act(() => result.current.setView('packs'));

    expect(result.current.view).toBe('packs');
    expect(result.current.search).toBe('?foo=1&view=packs');
  });

  it('drops the param when going back to All', () => {
    const { result } = renderView('/simulation-catalog?view=favorites');

    act(() => result.current.setView('all'));

    expect(result.current.view).toBe('all');
    expect(result.current.search).toBe('');
  });
});
