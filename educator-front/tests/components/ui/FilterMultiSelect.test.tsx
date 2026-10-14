import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';
import {
  FilterMultiSelect,
  type MultiSelectServerOptions,
} from '../../../src/components/ui/FilterMultiSelect';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observer: {
  callback: ObserverCallback;
  root: Element | null;
  rootMargin?: string;
} | null = null;

beforeEach(() => {
  observer = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: ObserverCallback,
        init?: { root?: Element | null; rootMargin?: string }
      ) {
        observer = {
          callback,
          root: init?.root ?? null,
          rootMargin: init?.rootMargin,
        };
      }
      observe = vi.fn();
      disconnect = () => {
        observer = null;
      };
      unobserve = vi.fn();
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const options = [
  { value: 'a', label: 'Algebra' },
  { value: 'b', label: 'Biology' },
];

const server = (
  overrides: Partial<MultiSelectServerOptions> = {}
): MultiSelectServerOptions => ({
  onSearchChange: vi.fn(),
  onLoadMore: vi.fn(),
  hasMore: true,
  isFetchingMore: false,
  isError: false,
  onRetry: vi.fn(),
  ...overrides,
});

type Props = Partial<Parameters<typeof FilterMultiSelect>[0]>;

const renderSelect = (props: Props = {}) =>
  render(
    <FilterMultiSelect
      options={options}
      values={[]}
      onChange={vi.fn()}
      placeholder="Pick"
      searchable
      {...props}
    />
  );

// Without a label the trigger is named by its placeholder.
const openDropdown = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Pick' }));

/** The end-of-list sentinel scrolls into the list's view. */
const reachListEnd = () =>
  act(() => observer?.callback([{ isIntersecting: true }]));

/** The row shows a spinner; "Loading…" is for screen readers only. */
const expectSpinner = (row: HTMLElement) => {
  expect(row.querySelector('svg.animate-spin')).not.toBeNull();
  expect(within(row).getByText('Loading…')).toHaveClass('sr-only');
};

describe('FilterMultiSelect', () => {
  it('filters options locally without a server source', () => {
    renderSelect();
    openDropdown();
    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'bio' },
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('calls onOpen each time the dropdown opens', () => {
    const onOpen = vi.fn();
    renderSelect({ onOpen });
    openDropdown();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stacks the dropdown above the Modal overlay (z-[99999])', () => {
    renderSelect();
    openDropdown();
    const dropdown = screen
      .getByRole('option', { name: 'Algebra' })
      .closest<HTMLElement>('[data-select-dropdown]');
    expect(Number(dropdown?.style.zIndex)).toBeGreaterThan(99999);
  });

  it('sends the search to the server and shows the options as given', () => {
    const source = server();
    renderSelect({ server: source });
    openDropdown();
    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'bio' },
    });
    expect(source.onSearchChange).toHaveBeenLastCalledWith('bio');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('clears a server search when the dropdown closes', () => {
    const source = server();
    renderSelect({ server: source });
    openDropdown();
    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'bio' },
    });
    fireEvent.mouseDown(document.body);

    expect(source.onSearchChange).toHaveBeenLastCalledWith('');
    openDropdown();
    expect(screen.getByPlaceholderText('Search…')).toHaveValue('');
  });

  it('loads the next page when the end of the list scrolls into view', () => {
    const source = server();
    renderSelect({ server: source });
    openDropdown();

    // Observed inside the dropdown list, not the page.
    expect(observer?.root).toBe(screen.getByRole('listbox'));
    expect(observer?.rootMargin).toBe('40px');
    reachListEnd();
    expect(source.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a page is loading', { isFetchingMore: true }],
    ['the last page has loaded', { hasMore: false }],
    ['a request failed', { isError: true }],
  ])('does not watch for the list end while %s', (_case, overrides) => {
    const source = server(overrides);
    renderSelect({ server: source });
    openDropdown();

    expect(observer).toBeNull();
    reachListEnd();
    expect(source.onLoadMore).not.toHaveBeenCalled();
  });

  it('does not watch for the list end while the first page loads', () => {
    renderSelect({ options: [], loading: true, server: server() });
    openDropdown();
    expect(observer).toBeNull();
  });

  it('shows a loading row while the next page loads', () => {
    renderSelect({ server: server({ isFetchingMore: true }) });
    openDropdown();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expectSpinner(screen.getByRole('status'));
  });

  it('shows a loader instead of "No data found" while the first page loads', () => {
    renderSelect({ options: [], loading: true, server: server() });
    openDropdown();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expectSpinner(screen.getByRole('status'));
    expect(screen.queryByText('No data found')).not.toBeInTheDocument();
  });

  it('offers a retry when a request fails', () => {
    const source = server({ isError: true });
    renderSelect({ options: [], server: source });
    openDropdown();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load options."
    );
    expect(screen.queryByText('No data found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(source.onRetry).toHaveBeenCalledTimes(1);
  });

  it('names the trigger after its visible label', () => {
    renderSelect({ label: 'School' });
    expect(screen.getByRole('button', { name: 'School' })).toHaveAttribute(
      'aria-haspopup',
      'listbox'
    );
  });

  it.each(['Enter', ' '])(
    'removes only that chip when %j is pressed on its remove button',
    (key) => {
      // jsdom has no layout; the focused option is scrolled into view.
      Element.prototype.scrollIntoView = vi.fn();
      const onChange = vi.fn();
      renderSelect({ label: 'School', values: ['a', 'b'], onChange });
      const trigger = screen.getByRole('button', { name: 'School' });
      // Open and move focus to the first option, so a bubbled key would toggle it.
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      const remove = screen.getByRole('button', { name: 'Remove Algebra' });
      fireEvent.keyDown(remove, { key });
      fireEvent.click(remove);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(['b']);
    }
  );

  it('keeps the chip remove and clear buttons outside the trigger button', () => {
    renderSelect({ label: 'School', values: ['a'] });
    const trigger = screen.getByRole('button', { name: 'School' });

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.querySelector('button')).toBeNull();
    expect(trigger).not.toContainElement(
      screen.getByRole('button', { name: 'Remove Algebra' })
    );
    expect(trigger).not.toContainElement(
      screen.getByRole('button', { name: 'Clear all selections' })
    );
  });

  it('removes a chip by click without opening the dropdown', () => {
    const onChange = vi.fn();
    renderSelect({ label: 'School', values: ['a', 'b'], onChange });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Algebra' }));

    expect(onChange).toHaveBeenCalledWith(['b']);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('disables the trigger and the chip controls together', () => {
    const onChange = vi.fn();
    renderSelect({ label: 'School', values: ['a'], disabled: true, onChange });

    const trigger = screen.getByRole('button', { name: 'School' });
    expect(trigger).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove Algebra' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Clear all selections' })
    ).toBeDisabled();

    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not open the dropdown from a key pressed on a nested button', () => {
    renderSelect({ label: 'School', values: ['a'] });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove Algebra' }), {
      key: 'Enter',
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('labels selected values that are not in the loaded options', () => {
    renderSelect({
      options: [],
      values: ['x'],
      selectedLabels: { x: 'Chemistry' },
    });
    expect(screen.getByText('Chemistry')).toBeInTheDocument();
  });
});
