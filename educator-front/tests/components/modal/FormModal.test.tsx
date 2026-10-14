import { render, screen, fireEvent } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { FormModal } from '../../../src/components/modal/FormModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: 'Create Class',
  formId: 'test-form',
  onSubmit: vi.fn(),
  submitText: 'Create',
  submittingText: 'Saving...',
  cancelText: 'Back',
  isSubmitting: false,
};

const renderFormModal = (overrides: Partial<typeof defaultProps> = {}) => {
  const props = {
    ...defaultProps,
    onClose: vi.fn(),
    onSubmit: vi.fn((e: FormEvent) => e.preventDefault()),
    ...overrides,
  };
  render(
    <FormModal {...props}>
      <input aria-label="Name" />
    </FormModal>
  );
  return props;
};

describe('FormModal', () => {
  it('renders nothing when closed', () => {
    renderFormModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and form fields', () => {
    renderFormModal();
    expect(screen.getByText('Create Class')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('links the footer submit button to the form by id', () => {
    renderFormModal();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute(
      'form',
      'test-form'
    );
    expect(document.getElementById('test-form')?.tagName).toBe('FORM');
  });

  it('calls onSubmit when the form is submitted', () => {
    const props = renderFormModal();
    fireEvent.submit(document.getElementById('test-form') as HTMLFormElement);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is clicked', () => {
    const props = renderFormModal();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner with the submitting text and disables submit while submitting', () => {
    renderFormModal({ isSubmitting: true });
    const submit = screen.getByRole('button', { name: 'Saving...' });
    expect(submit).toBeDisabled();
    expect(submit.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('shows no spinner when not submitting', () => {
    renderFormModal();
    expect(
      screen.getByRole('button', { name: 'Create' }).querySelector('svg')
    ).toBeNull();
  });

  it('disables submit when isSubmitDisabled is true', () => {
    render(
      <FormModal {...defaultProps} isSubmitDisabled>
        <input aria-label="Name" />
      </FormModal>
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('uses the gradient submit by default', () => {
    renderFormModal();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveClass(
      'bg-gradient-btn'
    );
  });

  it('can use the solid brand submit', () => {
    render(
      <FormModal {...defaultProps} isSubmitting submitTone="primary">
        <input aria-label="Name" />
      </FormModal>
    );
    const submit = screen.getByRole('button', { name: 'Saving...' });
    expect(submit).toHaveClass('bg-primary-500');
    expect(submit).not.toHaveClass('bg-gradient-btn');
  });

  it('cannot be closed while submitting', () => {
    const { onClose } = renderFormModal({ isSubmitting: true });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBeDisabled();
    fireEvent.click(back);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a submit (e.g. Enter in a field) while submitting', () => {
    const props = renderFormModal({ isSubmitting: true });
    const form = document.getElementById('test-form');
    if (!form) throw new Error('Form not rendered');

    fireEvent.submit(form);

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('ignores a submit while isSubmitDisabled is true', () => {
    const onSubmit = vi.fn();
    render(
      <FormModal {...defaultProps} onSubmit={onSubmit} isSubmitDisabled>
        <input aria-label="Name" />
      </FormModal>
    );
    const form = document.getElementById('test-form');
    if (!form) throw new Error('Form not rendered');

    fireEvent.submit(form);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
