import dayjs from 'dayjs';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';

import { getClassFormSchema } from '../../schemas/classForm.schema';
import type { Class, ClassFormValues } from '../../types/Class_types';
import { computeClassStatus } from '../../utils/classUtils';
import { toast } from '../common/Toast';
import { FormModal } from '../modal/FormModal';
import {
  ClassFormFields,
  getSubmittableClassName,
  type EducatorSchool,
} from './ClassFormFields';

interface EditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClass: Class | null;
  educatorSchools: EducatorSchool[];
  onSubmit: (values: ClassFormValues) => Promise<void>;
}

/**
 * Keeps a manually set ARCHIEVED/INACTIVE status; otherwise derives it from the
 * dates. DRAFT/ATTENTION can't be picked any more, so those classes open with
 * the date-derived status instead.
 */
const getOriginalStatus = (cls: Class | null): ClassFormValues['status'] => {
  if (!cls) return 'ACTIVE';
  if (cls.status === 'ARCHIEVED' || cls.status === 'INACTIVE') {
    return cls.status;
  }
  return computeClassStatus(cls.start_date, cls.end_date);
};

const toDateOnly = (value?: string) => value?.split('T')[0] ?? '';

export const EditClassModal = ({
  isOpen,
  onClose,
  selectedClass,
  educatorSchools,
  onSubmit,
}: EditClassModalProps) => {
  const { t } = useTranslation('classManagement');

  const formik = useFormik<ClassFormValues>({
    enableReinitialize: true,
    initialValues: {
      school_id:
        selectedClass?.school_id ||
        (educatorSchools.length === 1 ? educatorSchools[0]?.id || '' : ''),
      class_name: selectedClass?.class_name || '',
      status: getOriginalStatus(selectedClass),
      start_date: toDateOnly(selectedClass?.start_date),
      end_date: toDateOnly(selectedClass?.end_date),
      total_no_of_students: '',
    },
    validationSchema: getClassFormSchema({
      t,
      modalMode: 'edit',
      hasSchools: educatorSchools.length >= 1,
    }),
    onSubmit: async (values, helpers) => {
      const result = getSubmittableClassName(values.class_name);
      if (result.errorKey) {
        helpers.setFieldError('class_name', t(result.errorKey));
        return;
      }

      if (selectedClass) {
        const noChanges =
          result.className === (selectedClass.class_name ?? '') &&
          values.start_date === toDateOnly(selectedClass.start_date) &&
          values.end_date === toDateOnly(selectedClass.end_date) &&
          values.status === getOriginalStatus(selectedClass) &&
          (values.school_id ?? '') === (selectedClass.school_id ?? '');
        if (noChanges) {
          toast.error(t('form.deleteNoChangesApplied'));
          return;
        }
      }

      await onSubmit({ ...values, class_name: result.className });
    },
  });

  // Dates can only change while the class hasn't started yet.
  const isDateLocked = !dayjs(toDateOnly(selectedClass?.start_date)).isAfter(
    dayjs(),
    'day'
  );

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('form.editTitle')}
      formId="class-form"
      onSubmit={formik.handleSubmit}
      submitText={t('form.updateClass')}
      submittingText={t('form.saving')}
      cancelText={t('form.back')}
      isSubmitting={formik.isSubmitting}
    >
      <ClassFormFields
        formik={formik}
        educatorSchools={educatorSchools}
        isSchoolRequired={false}
        isDateLocked={isDateLocked}
      />
    </FormModal>
  );
};
