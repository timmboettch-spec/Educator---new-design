import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimActionsMenu } from '../../../../src/components/class/simsubtable/SimActionsMenu';
import { renderWithProviders } from '../../../../src/test/testUtils';

// Run the initial-focus requestAnimationFrame synchronously.
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});
afterEach(() => vi.restoreAllMocks());

const renderMenu = (isEmail = false, isEditDisabled = false) => {
  const trigger = document.createElement('button');
  trigger.setAttribute('data-sim-trigger', 'true');
  document.body.appendChild(trigger);
  const onClose = vi.fn();
  const onSelect = vi.fn();
  renderWithProviders(
    <SimActionsMenu
      anchorEl={trigger}
      simId="assign-1"
      isEmail={isEmail}
      isEditDisabled={isEditDisabled}
      onClose={onClose}
      onSelect={onSelect}
    />
  );
  const items = () =>
    within(
      document.querySelector<HTMLElement>('[data-sim-dropdown]') as HTMLElement
    ).getAllByRole('button');
  return { trigger, onClose, onSelect, items };
};

const press = (key: string, shiftKey = false) =>
  act(() => {
    fireEvent.keyDown(document, { key, shiftKey });
  });

describe('SimActionsMenu', () => {
  afterEach(() => {
    document.querySelector('[data-sim-trigger]')?.remove();
  });

  it('separates only Delete from the other actions with a divider', () => {
    const { items } = renderMenu();
    const withDivider = items().filter((item) =>
      item.className.includes('border-t')
    );
    expect(withDivider.map((item) => item.textContent?.trim())).toEqual([
      'Delete Sim Assignment',
    ]);
    expect(items().some((item) => item.className.includes('border-b'))).toBe(
      false
    );
  });

  it('clips item hover backgrounds to its rounded corners', () => {
    renderMenu();
    expect(document.querySelector('[data-sim-dropdown]')).toHaveClass(
      'rounded-xl',
      'overflow-hidden'
    );
  });

  it('labels the grade export "Export Grades"', () => {
    const { items } = renderMenu();
    expect(items().map((item) => item.textContent?.trim())).toContain(
      'Export Grades'
    );
  });

  it('focuses the first item when it opens', () => {
    const { items } = renderMenu();
    expect(items()[0]).toHaveTextContent('Edit Assignment Details');
    expect(items()[0]).toHaveFocus();
  });

  it('moves with the arrow keys and wraps at both ends', () => {
    const { items } = renderMenu();
    const all = items();

    press('ArrowDown');
    expect(all[1]).toHaveFocus();
    press('ArrowUp');
    press('ArrowUp');
    expect(all[all.length - 1]).toHaveTextContent('Delete Sim Assignment');
    expect(all[all.length - 1]).toHaveFocus();
    press('ArrowDown');
    expect(all[0]).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the menu', () => {
    const { items } = renderMenu();
    const all = items();

    press('Tab', true);
    expect(all[all.length - 1]).toHaveFocus();
    press('Tab');
    expect(all[0]).toHaveFocus();
  });

  it('skips a disabled item', () => {
    const { items } = renderMenu(true);
    const email = screen.getByRole('button', { name: 'Email Reports' });
    expect(email).toBeDisabled();

    const all = items();
    const before = all.indexOf(email) - 1;
    all[before]?.focus();
    press('ArrowDown');
    expect(all[before + 2]).toHaveFocus();
  });

  it('closes on Escape and returns focus to its trigger', () => {
    const { trigger, onClose } = renderMenu();
    press('Escape');
    expect(onClose).toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click but not on its trigger', () => {
    const { trigger, onClose } = renderMenu();
    fireEvent.mouseDown(trigger);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('reports the chosen action for its assignment', () => {
    const { onSelect } = renderMenu();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark All Reports Reviewed' })
    );
    expect(onSelect).toHaveBeenCalledWith('mark_all_reviewed', 'assign-1');
  });

  it('disables Edit for a Past assignment', () => {
    const { onSelect } = renderMenu(false, true);
    const edit = screen.getByRole('button', {
      name: 'Edit Assignment Details',
    });

    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
