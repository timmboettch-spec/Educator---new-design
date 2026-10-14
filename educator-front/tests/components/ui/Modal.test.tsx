import { useState } from 'react';
import { createPortal } from 'react-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../../../src/components/ui/Modal';

/** Opens a modal from a button; `unmountWhenClosed` mimics `if (!isOpen) return null`. */
function Harness({ unmountWhenClosed }: { unmountWhenClosed: boolean }) {
  const [open, setOpen] = useState(false);
  const modal = (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Dialog">
      <button type="button" onClick={() => setOpen(false)}>
        Done
      </button>
    </Modal>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {unmountWhenClosed ? open && modal : modal}
    </>
  );
}

const openThenClose = (closeWith: 'button' | 'escape') => {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  // As a user would: focus is inside the dialog when it closes.
  screen.getByRole('button', { name: 'Done' }).focus();
  act(() => {
    if (closeWith === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  return opener;
};

describe('Modal focus restore', () => {
  it('returns focus to the opener when isOpen turns false', () => {
    render(<Harness unmountWhenClosed={false} />);
    const opener = openThenClose('button');
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener when the parent unmounts it (Escape)', () => {
    render(<Harness unmountWhenClosed />);
    const opener = openThenClose('escape');
    expect(opener).toHaveFocus();
  });
});

/** A portaled dropdown, as Select/MultiSelect render them. */
const Dropdown = () =>
  createPortal(
    <div data-select-dropdown>
      <input aria-label="Search" />
    </div>,
    document.body
  );

const renderModal = (onClose = vi.fn()) => {
  render(
    <>
      <button type="button">Outside</button>
      <Modal isOpen onClose={onClose} title="Dialog">
        <button type="button">Inside</button>
        <Dropdown />
      </Modal>
    </>
  );
  return onClose;
};

describe('Modal field dropdowns', () => {
  it('closes on Escape', () => {
    const onClose = renderModal();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open on Escape inside a portaled field dropdown', () => {
    const onClose = renderModal();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), {
      key: 'Escape',
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets a portaled dropdown of a field keep focus', () => {
    renderModal();
    const search = screen.getByRole('textbox', { name: 'Search' });
    search.focus();
    expect(search).toHaveFocus();
  });

  it('moves focus that leaves the dialog back inside it', () => {
    renderModal();
    screen.getByRole('button', { name: 'Outside', hidden: true }).focus();
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'Outside', hidden: true })
    );
  });
});

/** A form modal and, opened later from it, a confirm dialog on top (as in the assign modal). */
function Stacked({ onCloseForm }: { onCloseForm: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Modal isOpen onClose={onCloseForm} title="Form">
        <button type="button" onClick={() => setConfirmOpen(true)}>
          Submit
        </button>
      </Modal>
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm"
      >
        <button type="button">Cancel</button>
        <button type="button">Confirm</button>
      </Modal>
    </>
  );
}

const openConfirm = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

describe('Stacked modals', () => {
  it('closes only the top dialog on Escape, then the one below', () => {
    const onCloseForm = vi.fn();
    render(<Stacked onCloseForm={onCloseForm} />);
    openConfirm();
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: 'Confirm' })
    ).not.toBeInTheDocument();
    expect(onCloseForm).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseForm).toHaveBeenCalledTimes(1);
  });

  it('lets focus move inside the top dialog without the one below pulling it back', () => {
    render(<Stacked onCloseForm={vi.fn()} />);
    openConfirm();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    act(() => confirm.focus());
    expect(confirm).toHaveFocus();
  });
});
