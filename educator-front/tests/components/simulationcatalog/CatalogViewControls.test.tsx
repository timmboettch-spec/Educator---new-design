import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../../src/i18n';
import { CatalogGroupTile } from '../../../src/components/simulationcatalog/CatalogGroupTile';
import { CatalogViewSwitcher } from '../../../src/components/simulationcatalog/CatalogViewSwitcher';

const renderUi = (ui: ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('CatalogViewSwitcher', () => {
  it('marks the current view as pressed', () => {
    renderUi(<CatalogViewSwitcher value="packs" onChange={vi.fn()} />);

    expect(
      screen.getByRole('group', { name: 'View Simulations' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sim Packs' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('reports the chosen view', () => {
    const onChange = vi.fn();
    renderUi(<CatalogViewSwitcher value="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Units' }));

    expect(onChange).toHaveBeenCalledWith('units');
  });
});

describe('CatalogGroupTile', () => {
  const baseProps = {
    name: 'Cardiology',
    simulationCount: 3,
    tone: 'unit' as const,
    isInLibrary: false,
    canFavorite: true,
    isSaving: false,
    onToggleLibrary: vi.fn(),
    onView: vi.fn(),
  };

  it('shows the name and simulation count', () => {
    renderUi(<CatalogGroupTile {...baseProps} />);

    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('3 simulations')).toBeInTheDocument();
  });

  it('opens the group from its View button', () => {
    const onView = vi.fn();
    renderUi(<CatalogGroupTile {...baseProps} onView={onView} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Cardiology' }));

    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('labels the heart by what it will do', () => {
    const { rerender } = renderUi(<CatalogGroupTile {...baseProps} />);
    expect(
      screen.getByRole('button', {
        name: 'Add all of Cardiology to My Library',
      })
    ).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <I18nextProvider i18n={i18n}>
        <CatalogGroupTile {...baseProps} isInLibrary />
      </I18nextProvider>
    );
    expect(
      screen.getByRole('button', {
        name: 'Remove all of Cardiology from My Library',
      })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('always shows an enabled heart, even for an empty group (as designed)', () => {
    const onToggleLibrary = vi.fn();
    renderUi(
      <CatalogGroupTile
        {...baseProps}
        simulationCount={0}
        onToggleLibrary={onToggleLibrary}
      />
    );

    const heart = screen.getByRole('button', { name: /My Library/ });
    expect(heart).toBeEnabled();
    fireEvent.click(heart);
    expect(onToggleLibrary).toHaveBeenCalledTimes(1);
  });

  it('hides the heart for accounts that cannot save to My Library', () => {
    renderUi(<CatalogGroupTile {...baseProps} canFavorite={false} />);

    expect(
      screen.queryByRole('button', { name: /My Library/ })
    ).not.toBeInTheDocument();
  });

  it('disables the heart while the group is saving', () => {
    renderUi(<CatalogGroupTile {...baseProps} isSaving />);

    expect(screen.getByRole('button', { name: /My Library/ })).toBeDisabled();
  });
});
