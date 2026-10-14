import { useTranslation } from 'react-i18next';
import { toast } from '../components/common/Toast';
import { patchClassInStore } from '../redux/class/GetClassRedux';
import {
  useCreateClassMutation,
  useUpdateClassMutation,
} from '../redux/api/classes/classesApi';
import {
  buildCreateClassBody,
  buildUpdateClassBody,
  getApiErrorMessage,
} from '../redux/api/classes/classesService';
import { useAppDispatch } from '../store/hooks';
import { translateApiError } from '../utils/translateApiError';
import { buildUpdateClassPayload } from '../utils/classFormSubmit';
import type {
  Class,
  ClassFormValues,
  ClassWithStudents,
  ModalMode,
} from '../types/Class_types';

export interface UseClassFormSubmitParams {
  modalMode: ModalMode;
  selectedClass: Class | null;
  allClasses: ClassWithStudents[];
  educatorSchools: Array<{ id: string; school_name: string }>;
  language: 'en' | 'es';
  /** Closes the create/edit modal, without refetching. */
  onClose: () => void;
  /** Refetches the class list after a successful create/edit. */
  refetchClasses: () => void | Promise<void>;
}

/** Submits the create/edit class form via the classes API mutations. */
export function useClassFormSubmit({
  modalMode,
  selectedClass,
  allClasses,
  educatorSchools,
  language,
  onClose,
  refetchClasses,
}: UseClassFormSubmitParams) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('classManagement');
  const [createClass] = useCreateClassMutation();
  const [updateClass] = useUpdateClassMutation();

  const handleFormSubmit = async (values: ClassFormValues) => {
    try {
      if (modalMode === 'edit' && selectedClass) {
        const result = buildUpdateClassPayload(values, selectedClass);
        if (result.noChange) {
          toast.error(t('toast.noChangesMade'));
          return;
        }

        try {
          await updateClass({
            id: selectedClass.id,
            body: buildUpdateClassBody(result.data),
          }).unwrap();

          dispatch(
            patchClassInStore({
              id: selectedClass.id,
              class_name: result.data.class_name,
              status: result.data.status,
              start_date: result.data.start_date,
              end_date: result.data.end_date,
              ...(result.data.school_id
                ? {
                    school_id: result.data.school_id,
                    school_name: educatorSchools.find(
                      (s) => s.id === result.data.school_id
                    )?.school_name,
                  }
                : {}),
            })
          );
          toast.success(t('toast.updated'));
          onClose();
          void refetchClasses();
        } catch (error) {
          const errorMsg = getApiErrorMessage(error, t('toast.updateError'));
          toast.error(translateApiError(errorMsg, language));
        }
        return;
      }

      if (modalMode === 'create') {
        const isDuplicate = allClasses.some(
          (cls) =>
            cls.class_name?.trim().toLowerCase() ===
            values.class_name.trim().toLowerCase()
        );
        if (isDuplicate) {
          toast.error(t('toast.classNameAlreadyExists'));
          return;
        }

        await createClass(buildCreateClassBody(values)).unwrap();
        toast.success(t('toast.created'));
        onClose();
        void refetchClasses();
      }
    } catch (err: unknown) {
      const message = getApiErrorMessage(
        err,
        modalMode === 'edit' ? t('toast.updateError') : t('toast.createError')
      );
      toast.error(translateApiError(message, language));
      onClose();
    }
  };

  return { handleFormSubmit };
}
