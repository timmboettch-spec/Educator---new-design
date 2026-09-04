import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { FormikProps } from 'formik';
import EducatorModal from '../../../src/components/modal/EducatorModal';

interface EducatorFormValues {
  full_name: string;
  email: string;
  phone_number: string;
  status: string;
  tokens: number;
  school_id: string;
}

interface School {
  id: string;
  school_name: string;
}

const mockSetOpen = vi.fn();
const mockSetOpenSchoolDropdown = vi.fn();

const mockFormik: Partial<FormikProps<EducatorFormValues>> = {
  values: {
    full_name: 'John Doe',
    email: 'john@example.com',
    phone_number: '9876543210',
    status: 'ACTIVE',
    tokens: 10,
    school_id: '1',
  },
  touched: {},
  errors: {},
  handleChange: vi.fn(),
  handleBlur: vi.fn(),
  handleSubmit: vi.fn((e) => e?.preventDefault()),
  setFieldValue: vi.fn(),
};

const schools: School[] = [
  { id: '1', school_name: 'ABC School' },
  { id: '2', school_name: 'XYZ School' },
];

describe('EducatorModal', () => {
  test('renders create modal correctly', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="create"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    expect(screen.getByPlaceholderText('Enter Educator Tokens')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Educator Email')).toBeInTheDocument();
    expect(screen.getAllByText('Create Educator')[0]).toBeInTheDocument();
  });

  test('renders edit mode phone number field', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="edit"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    expect(screen.getByText('Update Educator')).toBeInTheDocument();
  });

  test('does not render modal when isOpen is false', () => {
    const { container } = render(
      <EducatorModal
        isOpen={false}
        setOpen={mockSetOpen}
        modalMode="create"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  test('calls setOpen when back button clicked', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="create"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    fireEvent.click(screen.getByText('Back'));

    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  test('opens school dropdown on click', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="create"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    fireEvent.click(screen.getByText('ABC School'));

    expect(mockSetOpenSchoolDropdown).toHaveBeenCalled();
  });

  test('selects school from dropdown', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="create"
        schools={schools}
        openSchoolDropdown={true}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    fireEvent.click(screen.getByText('XYZ School'));

    expect(mockFormik.setFieldValue).toHaveBeenCalledWith('school_id', '2');
  });

  test('submit button works', () => {
    render(
      <EducatorModal
        isOpen={true}
        setOpen={mockSetOpen}
        modalMode="edit"
        schools={schools}
        openSchoolDropdown={false}
        setOpenSchoolDropdown={mockSetOpenSchoolDropdown}
        isSubmitting={false}
        formik={mockFormik as FormikProps<EducatorFormValues>}
      />,
    );

    fireEvent.click(screen.getByText('Update Educator'));

    expect(mockFormik.handleSubmit).toHaveBeenCalled();
  });
});
