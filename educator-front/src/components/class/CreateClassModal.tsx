import { useFormik } from 'formik';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import { getClassFormSchema } from '../../schemas/classForm.schema';
import type { ClassFormValues } from '../../types/Class_types';
import { FormModal } from '../modal/FormModal';
import {
  ClassFormFields,
  getSubmittableClassName,
  type EducatorSchool,
} from './ClassFormFields';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  educatorSchools: EducatorSchool[];
  onSubmit: (values: ClassFormValues) => Promise<void>;
}

export const CreateClassModal = ({
  isOpen,
  onClose,
  educatorSchools,
  onSubmit,
}: CreateClassModalProps) => {
  const { t } = useTranslation('classManagement');

  const singleSchoolId =
    educatorSchools.length === 1 ? educatorSchools[0]?.id?.trim() || '' : '';

  const formik = useFormik<ClassFormValues>({
    enableReinitialize: true,
    initialValues: {
      school_id: singleSchoolId,
      class_name: '',
      status: 'ACTIVE',
      start_date: '',
      end_date: '',
      total_no_of_students: '',
    },
    validationSchema: getClassFormSchema({
      t,
      modalMode: 'create',
      hasSchools: educatorSchools.length >= 1,
    }),
    onSubmit: async (values, helpers) => {
      const result = getSubmittableClassName(values.class_name);
      if (result.errorKey) {
        helpers.setFieldError('class_name', t(result.errorKey));
        return;
      }
      await onSubmit({ ...values, class_name: result.className });
    },
  });

  // Profile schools often arrive after the modal opens. Auto-select the only
  // school so create isn't blocked on a required empty school_id.
  useEffect(() => {
    if (!isOpen || !singleSchoolId) return;
    if (formik.values.school_id) return;
    void formik.setFieldValue('school_id', singleSchoolId, false);
  }, [isOpen, singleSchoolId, formik.values.school_id]);

  useEffect(() => {
    if (isOpen) formik.resetForm();
  }, [isOpen]);

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('form.createTitle')}
      formId="class-form"
      onSubmit={formik.handleSubmit}
      submitText={t('form.createClass')}
      submittingText={t('form.saving')}
      cancelText={t('form.back')}
      isSubmitting={formik.isSubmitting}
    >
      <ClassFormFields
        formik={formik}
        educatorSchools={educatorSchools}
        isSchoolRequired
        isDateLocked={false}
      />

      <FormField label={t('form.fieldStudents')}>
        <Input
          name="total_no_of_students"
          type="text"
          inputMode="numeric"
          placeholder={t('form.placeholderStudentCount')}
          value={formik.values.total_no_of_students}
          onChange={(e) => {
            const value = e.target.value;
            if (/^\d*$/.test(value))
              formik.setFieldValue('total_no_of_students', value);
          }}
          onKeyDown={(e) => {
            if (['-', '+', 'e', 'E', '.'].includes(e.key)) e.preventDefault();
          }}
          onBlur={formik.handleBlur}
          inputClassName="appearance-none"
          error={
            formik.touched.total_no_of_students
              ? formik.errors.total_no_of_students
              : undefined
          }
        />
      </FormField>
    </FormModal>
  );
};
