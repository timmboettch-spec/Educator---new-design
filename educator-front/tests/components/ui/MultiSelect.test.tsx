import { useState } from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MultiSelect,
  type MultiSelectOption,
} from '../../../src/components/ui/MultiSelect';
import { renderWithProviders } from '../../../src/test/testUtils';

const BIOLOGY: MultiSelectOption = { value: 'c1', label: 'Biology 101' };
const CHEMISTRY: MultiSelectOption = { value: 'c2', label: 'Chemistry 202' };
const PHYSICS: MultiSelectOption = {
  value: 'c3',
  label: 'Physics 303',
  description: 'STU-3',
};
const OPTIONS = [BIOLOGY, CHEMISTRY, PHYSICS];

function Harness({
  onSearchChange,
  loading = false,
  options = OPTIONS,
  initial = [],
  error,
  maxSelected,
  hasMore,
  onCreate,
}: {
  onCreate?: (name: string) => void;
  onSearchChange?: (v: string) => void;
  loading?: boolean;
  options?: MultiSelectOption[];
  initial?: MultiSelectOption[];
  error?: string;
  maxSelected?: number;
  hasMore?: boolean;
}) {
  const [selected, setSelected] = useState<MultiSelectOption[]>(initial);
  const [search, setSearch] = useState('');
  return (
    <MultiSelect
      label="Classes"
      placeholder="All classes"
      summaryNoun={(count) => (count === 1 ? 'class' : 'classes')}
      options={options}
      selected={selected}
      onChange={setSelected}
      searchValue={search}
      onSearchChange={
        onSearchChange
          ? (v) => {
              setSearch(v);
              onSearchChange(v);
            }
          : undefined
      }
      loading={loading}
      error={error}
      maxSelected={maxSelected}
      hasMore={hasMore}
      onCreate={onCreate}
      createLabel={(name) => `Create class "${name}"`}
    />
  );
}

const trigger = () => screen.getByRole('button', { name: /^Classes/ });

describe('MultiSelect', () => {
  it('shows the placeholder and is labelled for assistive tech', () => {
    renderWithProviders(<Harness />);
    expect(trigger()).toHaveAccessibleName('Classes All classes');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a multi-select listbox and toggles options by click', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(trigger());

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
    fireEvent.click(screen.getByRole('option', { name: /Chemistry 202/ }));

    expect(screen.getByRole('option', { name: /Biology 101/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(trigger()).toHaveTextContent('2 classes');

    fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
    expect(trigger()).toHaveTextContent('1 class');
  });

  it('clears every selection with Clear all', () => {
    renderWithProviders(<Harness initial={[BIOLOGY, CHEMISTRY]} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(trigger()).toHaveTextContent('All classes');
  });

  it('clears the selection from the trigger and returns focus to it', () => {
    renderWithProviders(<Harness initial={[BIOLOGY, CHEMISTRY]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear Classes' }));

    expect(trigger()).toHaveTextContent('All classes');
    expect(trigger()).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Clear Classes' })
    ).not.toBeInTheDocument();
  });

  it('shows Clear only when something is selected', () => {
    renderWithProviders(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Clear Classes' })
    ).not.toBeInTheDocument();
  });

  it('supports the keyboard: arrows move, Enter/Space toggle, Escape closes', () => {
    renderWithProviders(<Harness />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveFocus();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(
      screen.getByRole('option', { name: /Chemistry 202/ })
    ).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(listbox, { key: 'End' });
    fireEvent.keyDown(listbox, { key: ' ' });
    expect(screen.getByRole('option', { name: /Physics 303/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('forwards typing to onSearchChange and toggles from the search box with Enter', () => {
    const onSearchChange = vi.fn();
    renderWithProviders(<Harness onSearchChange={onSearchChange} />);
    fireEvent.click(trigger());

    const search = screen.getByRole('textbox', { name: 'Search…' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'bio' } });
    expect(onSearchChange).toHaveBeenCalledWith('bio');

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('option', { name: /Biology 101/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps a selection that is no longer in the current options', () => {
    renderWithProviders(
      <Harness initial={[{ value: 'old', label: 'Old Class' }]} />
    );
    expect(trigger()).toHaveTextContent('1 class');
  });

  it('shows loading and no-results states', () => {
    const { unmount } = renderWithProviders(<Harness loading />);
    fireEvent.click(trigger());
    const loadingText = within(screen.getByRole('listbox')).getByText(
      'Loading…'
    );
    expect(loadingText).toHaveClass('sr-only');
    expect(
      loadingText.parentElement?.querySelector('svg.animate-spin')
    ).not.toBeNull();
    unmount();

    renderWithProviders(<Harness options={[]} />);
    fireEvent.click(trigger());
    expect(screen.getByText('No matches found')).toBeInTheDocument();
  });

  it('caps the selection at maxSelected and lets selected items be removed', () => {
    renderWithProviders(<Harness maxSelected={2} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
    fireEvent.click(screen.getByRole('option', { name: /Chemistry 202/ }));

    const physics = screen.getByRole('option', { name: /Physics 303/ });
    expect(physics).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('You can select up to 2')).toBeInTheDocument();

    fireEvent.click(physics);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(physics).toHaveAttribute('aria-selected', 'false');
    expect(trigger()).toHaveTextContent('2 classes');

    fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
    expect(physics).not.toHaveAttribute('aria-disabled');
    expect(
      screen.queryByText('You can select up to 2')
    ).not.toBeInTheDocument();
  });

  it('tells the user to search when more options exist than were loaded', () => {
    const hint = 'Showing the first results. Type to search for more.';
    const { unmount } = renderWithProviders(<Harness hasMore />);
    fireEvent.click(trigger());
    expect(screen.getByText(hint)).toBeInTheDocument();
    unmount();

    renderWithProviders(<Harness />);
    fireEvent.click(trigger());
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('shows a load error instead of options', () => {
    renderWithProviders(<Harness error="We couldn't load these options." />);
    fireEvent.click(trigger());
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load these options."
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.queryByText('No matches found')).not.toBeInTheDocument();
  });

  it('closes on an outside click', () => {
    renderWithProviders(<Harness />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  describe('create option', () => {
    const search = (value: string) =>
      fireEvent.change(screen.getByRole('textbox', { name: 'Search…' }), {
        target: { value },
      });

    it('offers to create the searched name when nothing matches it exactly', () => {
      const onCreate = vi.fn();
      renderWithProviders(
        <Harness onSearchChange={vi.fn()} onCreate={onCreate} />
      );
      fireEvent.click(trigger());
      search('  Algebra ');

      fireEvent.click(
        screen.getByRole('option', { name: 'Create class "Algebra"' })
      );
      expect(onCreate).toHaveBeenCalledWith('Algebra');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('reaches the create option with the keyboard', () => {
      const onCreate = vi.fn();
      renderWithProviders(
        <Harness
          onSearchChange={vi.fn()}
          onCreate={onCreate}
          options={[BIOLOGY]}
        />
      );
      fireEvent.click(trigger());
      search('Bio');
      const input = screen.getByRole('textbox', { name: 'Search…' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCreate).toHaveBeenCalledWith('Bio');
    });

    it('hides the create option while more matches are left to load', () => {
      renderWithProviders(
        <Harness onSearchChange={vi.fn()} onCreate={vi.fn()} hasMore />
      );
      fireEvent.click(trigger());
      search('Algebra');
      expect(
        screen.queryByRole('option', { name: /Create class/ })
      ).not.toBeInTheDocument();
    });

    it('hides the create option on an exact match or an empty search', () => {
      renderWithProviders(
        <Harness onSearchChange={vi.fn()} onCreate={vi.fn()} />
      );
      fireEvent.click(trigger());
      expect(
        screen.queryByRole('option', { name: /Create class/ })
      ).not.toBeInTheDocument();
      search('biology 101');
      expect(
        screen.queryByRole('option', { name: /Create class/ })
      ).not.toBeInTheDocument();
    });
  });

  describe('single selection', () => {
    function SingleHarness({ onChange }: { onChange: (v: string) => void }) {
      const [selected, setSelected] = useState<MultiSelectOption[]>([]);
      return (
        <MultiSelect
          label="School"
          placeholder="Select School"
          summaryNoun={() => 'selected'}
          options={OPTIONS}
          selected={selected}
          onChange={(next) => {
            setSelected(next);
            onChange(next.map((o) => o.value).join(','));
          }}
          selectionMode="single"
        />
      );
    }

    const schoolTrigger = () => screen.getByRole('button', { name: /^School/ });

    it('replaces the selection, shows its name and closes the list', () => {
      const onChange = vi.fn();
      renderWithProviders(<SingleHarness onChange={onChange} />);
      fireEvent.click(schoolTrigger());
      expect(screen.getByRole('listbox')).toHaveAttribute(
        'aria-multiselectable',
        'false'
      );
      fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
      expect(onChange).toHaveBeenLastCalledWith('c1');
      expect(schoolTrigger()).toHaveTextContent('Biology 101');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      fireEvent.click(schoolTrigger());
      fireEvent.click(screen.getByRole('option', { name: /Chemistry 202/ }));
      expect(onChange).toHaveBeenLastCalledWith('c2');
      expect(schoolTrigger()).toHaveTextContent('Chemistry 202');
    });

    it('keeps the option when the selected one is picked again', () => {
      const onChange = vi.fn();
      renderWithProviders(<SingleHarness onChange={onChange} />);
      fireEvent.click(schoolTrigger());
      fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
      fireEvent.click(schoolTrigger());
      fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(schoolTrigger()).toHaveTextContent('Biology 101');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('has no Clear all in the list', () => {
      renderWithProviders(<SingleHarness onChange={vi.fn()} />);
      fireEvent.click(schoolTrigger());
      fireEvent.click(screen.getByRole('option', { name: /Biology 101/ }));
      fireEvent.click(schoolTrigger());
      expect(
        screen.queryByRole('button', { name: 'Clear all' })
      ).not.toBeInTheDocument();
    });
  });

  describe('lazy loading', () => {
    type ObserverCallback = (
      entries: Array<{ isIntersecting: boolean }>
    ) => void;
    let observerCallback: ObserverCallback | null = null;

    beforeEach(() => {
      observerCallback = null;
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: ObserverCallback) {
            observerCallback = callback;
          }
          observe = vi.fn();
          disconnect = () => {
            observerCallback = null;
          };
          unobserve = vi.fn();
        }
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const renderLazy = (
      props: Partial<React.ComponentProps<typeof MultiSelect>> = {}
    ) =>
      renderWithProviders(
        <MultiSelect
          label="Classes"
          placeholder="All classes"
          summaryNoun={() => 'classes'}
          options={OPTIONS}
          selected={[]}
          onChange={vi.fn()}
          {...props}
        />
      );

    it('calls onOpen each time the list opens', () => {
      const onOpen = vi.fn();
      renderLazy({ onOpen });
      fireEvent.click(trigger());
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('loads the next page when the end of the list scrolls into view', () => {
      const onLoadMore = vi.fn();
      renderLazy({ onLoadMore, hasMore: true });
      fireEvent.click(trigger());
      act(() => observerCallback?.([{ isIntersecting: true }]));
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      // Infinite scroll replaces the "type to search" hint.
      expect(
        screen.queryByText(/Type to search for more/)
      ).not.toBeInTheDocument();
    });

    it('shows a loading row while the next page loads, and does not ask again', () => {
      const onLoadMore = vi.fn();
      renderLazy({ onLoadMore, hasMore: true, isFetchingMore: true });
      fireEvent.click(trigger());
      const loadingText = screen.getByText('Loading…');
      expect(loadingText).toHaveClass('sr-only');
      expect(
        loadingText.parentElement?.querySelector('svg.animate-spin')
      ).not.toBeNull();
      expect(observerCallback).toBeNull();
    });

    it('stops observing once there is nothing more to load', () => {
      renderLazy({ onLoadMore: vi.fn(), hasMore: false });
      fireEvent.click(trigger());
      expect(observerCallback).toBeNull();
    });
  });
});
