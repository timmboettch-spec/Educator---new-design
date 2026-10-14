import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import '../../../src/i18n';
import { EditClassModal } from '../../../src/components/class/EditClassModal';
import type { Class } from '../../../src/types/Class_types';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: { error: toastError, success: vi.fn() },
}));

const inDays = (n: number) => dayjs().add(n, 'day').format('YYYY-MM-DD');

const startedClass: Class = {
  id: 'cls-1',
  class_name: 'Math 101',
  school_id: 'school-1',
  status: 'ACTIVE',
  start_date: `${inDays(0)}T00:00:00`,
  end_date: `${inDays(30)}T00:00:00`,
};

const renderModal = (selectedClass: Class = startedClass) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    selectedClass,
    educatorSchools: [{ id: 'school-1', school_name: 'Test School' }],
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };
  render(<EditClassModal {...props} />);
  return props;
};

describe('EditClassModal', () => {
  beforeEach(() => toastError.mockClear());

  it('pre-fills the class and has no student count field', () => {
    renderModal();
    expect(
      screen.getByRole('heading', { name: 'Edit Class' })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Class name')).toHaveValue(
      'Math 101'
    );
    expect(
      screen.queryByPlaceholderText('Number of Students (Create Codes Only)')
    ).not.toBeInTheDocument();
  });

  it('locks the dates once the class has started', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Pick start date' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the dates editable for a class that starts in the future', () => {
    renderModal({
      ...startedClass,
      status: 'INACTIVE',
      start_date: `${inDays(5)}T00:00:00`,
    });
    expect(
      screen.getByRole('button', { name: 'Pick start date' })
    ).toHaveAttribute('aria-disabled', 'false');
  });

  it('shows a toast and does not submit when nothing changed', async () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Update Class' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('No changes applied.')
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('offers only the Active, Inactive and Archived statuses', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent)
    ).toEqual(['Active', 'Inactive', 'Archived']);
  });

  it.each(['DRAFT', 'ATTENTION'] as const)(
    'opens a %s class with its date-derived status and treats no edits as no change',
    async (status) => {
      const props = renderModal({ ...startedClass, status });
      expect(
        screen.getByRole('button', { name: 'Active' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Update Class' }));
      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith('No changes applied.')
      );
      expect(props.onSubmit).not.toHaveBeenCalled();
    }
  );

  it('keeps a manually set INACTIVE status on a started class and treats no edits as no change', async () => {
    const props = renderModal({ ...startedClass, status: 'INACTIVE' });
    expect(
      screen.getByRole('button', { name: 'Inactive' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update Class' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('No changes applied.')
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the changed class name', async () => {
    const props = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter Class name'), {
      target: { value: 'Math 102' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Class' }));
    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          class_name: 'Math 102',
          school_id: 'school-1',
        })
      )
    );
  });
});
