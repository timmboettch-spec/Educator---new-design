import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  createClass: vi.fn(),
  updateClass: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
}));
vi.mock('../../../src/redux/api/classes/classesApi', () => ({
  useCreateClassMutation: () => [mocks.createClass],
  useUpdateClassMutation: () => [mocks.updateClass],
}));
vi.mock('../../../src/redux/class/GetClassRedux', () => ({
  patchClassInStore: (payload: unknown) => ({
    type: 'GetClass/patchClassInStore',
    payload,
  }),
}));
vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock('../../../src/utils/translateApiError', () => ({
  translateApiError: (message: string) => message,
}));

import {
  useClassFormSubmit,
  type UseClassFormSubmitParams,
} from '../../../src/hooks/useClassFormSubmit';
import {
  buildCreateClassBody,
  buildUpdateClassBody,
} from '../../../src/redux/api/classes/classesService';
import type { Class, ClassFormValues } from '../../../src/types/Class_types';

/** A mutation trigger whose `.unwrap()` settles as given. */
const settles = (outcome: 'resolve' | 'reject', value?: unknown) => ({
  unwrap: () =>
    outcome === 'resolve' ? Promise.resolve(value) : Promise.reject(value),
});

const beError = (message: string) => ({ status: 400, data: { message } });

const existingClass: Class = {
  id: 'c-1',
  class_name: 'Biology',
  status: 'ARCHIEVED',
  start_date: '2026-01-10T00:00:00.000Z',
  end_date: '2026-06-30T00:00:00.000Z',
  school_id: 's-1',
};

const unchangedValues: ClassFormValues = {
  class_name: 'Biology',
  status: 'ARCHIEVED',
  start_date: '2026-01-10',
  end_date: '2026-06-30',
  school_id: 's-1',
  total_no_of_students: '',
};

const newClassValues: ClassFormValues = {
  class_name: 'Physics',
  status: 'ARCHIEVED',
  start_date: '2026-02-01',
  end_date: '2026-07-01',
  school_id: 's-2',
  total_no_of_students: '25',
};

const renderSubmit = (params: Partial<UseClassFormSubmitParams> = {}) => {
  const onClose = vi.fn();
  const refetchClasses = vi.fn();
  const { result } = renderHook(() =>
    useClassFormSubmit({
      modalMode: 'create',
      selectedClass: null,
      allClasses: [existingClass],
      educatorSchools: [
        { id: 's-1', school_name: 'Hillcrest' },
        { id: 's-2', school_name: 'Lakeside' },
      ],
      language: 'en',
      onClose,
      refetchClasses,
      ...params,
    })
  );
  const submit = (values: ClassFormValues) =>
    act(() => result.current.handleFormSubmit(values));
  return { submit, onClose, refetchClasses };
};

describe('useClassFormSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClass.mockReturnValue(settles('resolve'));
    mocks.updateClass.mockReturnValue(settles('resolve'));
  });

  describe('edit', () => {
    const renderEdit = () =>
      renderSubmit({ modalMode: 'edit', selectedClass: existingClass });

    it('does not send an update when nothing changed', async () => {
      const { submit, onClose } = renderEdit();
      await submit(unchangedValues);

      expect(mocks.toastError).toHaveBeenCalledWith('No changes made');
      expect(mocks.updateClass).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('updates the class, patches the list, then closes and refetches', async () => {
      const { submit, onClose, refetchClasses } = renderEdit();
      const values = {
        ...unchangedValues,
        class_name: 'Biology II',
        school_id: 's-2',
      };
      await submit(values);

      expect(mocks.updateClass).toHaveBeenCalledWith({
        id: 'c-1',
        body: buildUpdateClassBody({
          class_name: 'Biology II',
          status: 'ARCHIEVED',
          start_date: '2026-01-10',
          end_date: '2026-06-30',
          school_id: 's-2',
        }),
      });
      expect(mocks.dispatch).toHaveBeenCalledWith({
        type: 'GetClass/patchClassInStore',
        payload: expect.objectContaining({
          id: 'c-1',
          class_name: 'Biology II',
          school_id: 's-2',
          school_name: 'Lakeside',
        }),
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Class updated successfully'
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refetchClasses).toHaveBeenCalledTimes(1);
    });

    it('keeps the modal open and shows the BE message when the update fails', async () => {
      mocks.updateClass.mockReturnValue(
        settles('reject', beError('End date is invalid'))
      );
      const { submit, onClose, refetchClasses } = renderEdit();
      await submit({ ...unchangedValues, class_name: 'Biology II' });

      expect(mocks.toastError).toHaveBeenCalledWith('End date is invalid');
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(refetchClasses).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the update error has none', async () => {
      mocks.updateClass.mockReturnValue(settles('reject', new Error('boom')));
      const { submit } = renderEdit();
      await submit({ ...unchangedValues, class_name: 'Biology II' });

      expect(mocks.toastError).toHaveBeenCalledWith('Failed to update class');
    });
  });

  describe('create', () => {
    it('creates the class, then closes and refetches', async () => {
      const { submit, onClose, refetchClasses } = renderSubmit();
      await submit(newClassValues);

      expect(mocks.createClass).toHaveBeenCalledWith(
        buildCreateClassBody(newClassValues)
      );
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Class created successfully'
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refetchClasses).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate class name, ignoring case and spaces', async () => {
      const { submit, onClose } = renderSubmit();
      await submit({ ...newClassValues, class_name: '  bIOLOGY ' });

      expect(mocks.toastError).toHaveBeenCalledWith(
        'Class name already exists'
      );
      expect(mocks.createClass).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows the BE message and closes the modal when creating fails', async () => {
      mocks.createClass.mockReturnValue(
        settles('reject', beError('No seats left'))
      );
      const { submit, onClose, refetchClasses } = renderSubmit();
      await submit(newClassValues);

      expect(mocks.toastError).toHaveBeenCalledWith('No seats left');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refetchClasses).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the create error has none', async () => {
      mocks.createClass.mockReturnValue(settles('reject', new Error('boom')));
      const { submit } = renderSubmit();
      await submit(newClassValues);

      expect(mocks.toastError).toHaveBeenCalledWith('Failed to create class');
    });
  });
});
