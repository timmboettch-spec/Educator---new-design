import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import '../../../src/i18n';
import { CreateClassModal } from '../../../src/components/class/CreateClassModal';

const TODAY = dayjs().format('YYYY-MM-DD');
const TOMORROW = dayjs().add(1, 'day').format('YYYY-MM-DD');

const renderModal = (overrides = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    educatorSchools: [{ id: 'school-1', school_name: 'Test School' }],
    onSubmit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<CreateClassModal {...props} />);
  return props;
};

const fillDates = () => {
  const [start, end] = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="date"]')
  );
  fireEvent.change(start as HTMLInputElement, { target: { value: TODAY } });
  fireEvent.change(end as HTMLInputElement, { target: { value: TOMORROW } });
};

describe('CreateClassModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the create title, student count and Create Class button', () => {
    renderModal();
    expect(
      screen.getByRole('heading', { name: 'Create Class' })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Number of Students (Create Codes Only)')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Class' })
    ).toBeInTheDocument();
  });

  it('submits the trimmed class name and student count', async () => {
    const props = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter Class name'), {
      target: { value: '  Bio 101  ' },
    });
    fillDates();
    fireEvent.change(
      screen.getByPlaceholderText('Number of Students (Create Codes Only)'),
      { target: { value: '12' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

    await waitFor(() =>
      expect(props.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          school_id: 'school-1',
          class_name: 'Bio 101',
          start_date: TODAY,
          end_date: TOMORROW,
          total_no_of_students: '12',
        })
      )
    );
  });

  it('does not submit without a class name', async () => {
    const props = renderModal();
    fillDates();
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
    expect(
      await screen.findByText('Class name is required')
    ).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('calls onClose when Back is clicked', () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
