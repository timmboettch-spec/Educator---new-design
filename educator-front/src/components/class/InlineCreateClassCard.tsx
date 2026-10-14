import { useFormik } from 'formik';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../ui/Button';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import { useCreateClassMutation } from '../../redux/api/classes/classesApi';
import type { ClassResDto } from '../../redux/api/classes/classes.types';
import {
  buildCreateClassBody,
  getApiErrorMessage,
} from '../../redux/api/classes/classesService';
import { getClassFormSchema } from '../../schemas/classForm.schema';
import type { ClassFormValues } from '../../types/Class_types';
import { computeClassStatus } from '../../utils/classUtils';
import { ClassFormFields, getSubmittableClassName } from './ClassFormFields';

interface InlineCreateClassCardProps {
  /** Shown read-only; the class is created under this school. */
  schoolLabel: string;
  /** Undefined for "No School". */
  schoolId: string | undefined;
  initialName: string;
  /** YYYY-MM-DD, prefilled from the assignment's dates. */
  initialStartDate: string;
  initialEndDate: string;
  /** Every class name the educator already has, to block duplicates. */
  existingClassNames: string[];
  onCreated: (created: ClassResDto) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Creates a class without leaving the assign modal. It sits inside the
 * modal's <form>, so it isn't a form itself: its button and Enter submit it.
 */
export function InlineCreateClassCard({
  schoolLabel,
  schoolId,
  initialName,
  initialStartDate,
  initialEndDate,
  existingClassNames,
  onCreated,
  onCancel,
}: InlineCreateClassCardProps) {
  const { t } = useTranslation('simulationAssignment');
  const { t: tClass } = useTranslation('classManagement');
  const [createClass] = useCreateClassMutation();

  const formik = useFormik<ClassFormValues>({
    initialValues: {
      school_id: schoolId ?? '',
      class_name: initialName,
      status: initialStartDate
        ? computeClassStatus(initialStartDate, initialEndDate)
        : 'ACTIVE',
      start_date: initialStartDate,
      end_date: initialEndDate,
      total_no_of_students: '',
    },
    validationSchema: getClassFormSchema({
      t: tClass,
      modalMode: 'create',
      hasSchools: false,
    }),
    onSubmit: async (values, helpers) => {
      const result = getSubmittableClassName(values.class_name);
      if (result.errorKey) {
        helpers.setFieldError('class_name', tClass(result.errorKey));
        return;
      }
      const name = result.className.toLowerCase();
      if (existingClassNames.some((n) => n.trim().toLowerCase() === name)) {
        helpers.setFieldError('class_name', t('inlineClass.nameExists'));
        return;
      }
      helpers.setStatus(undefined);
      try {
        const created = await createClass(
          buildCreateClassBody({ ...values, class_name: result.className })
        ).unwrap();
        await onCreated(created);
      } catch (error) {
        helpers.setStatus(
          getApiErrorMessage(error, t('inlineClass.createError'))
        );
      }
    },
  });

  // Enter in a text field would submit the outer assign form; submit this card instead.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    e.stopPropagation();
    void formik.submitForm();
  };

  const apiError = typeof formik.status === 'string' ? formik.status : null;

  return (
    <div
      role="group"
      aria-label={t('inlineClass.title')}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4"
    >
      <p className="text-sm font-semibold text-primary-600">
        {t('inlineClass.title')}
      </p>

      <Input
        label={t('inlineClass.fieldSchool')}
        value={schoolLabel}
        readOnly
        inputClassName="bg-gray-100 text-gray-600 cursor-not-allowed"
      />

      <ClassFormFields
        formik={formik}
        educatorSchools={[]}
        isSchoolRequired={false}
        isDateLocked={false}
      />

      <div>
        <FormField
          label={`${t('inlineClass.fieldStudents')} ${t('inlineClass.optional')}`}
        >
          <Input
            name="total_no_of_students"
            type="text"
            inputMode="numeric"
            placeholder={t('inlineClass.placeholderStudents')}
            value={formik.values.total_no_of_students}
            onChange={(e) => {
              if (/^\d*$/.test(e.target.value)) {
                void formik.setFieldValue(
                  'total_no_of_students',
                  e.target.value
                );
              }
            }}
            onBlur={formik.handleBlur}
            error={
              formik.touched.total_no_of_students
                ? formik.errors.total_no_of_students
                : undefined
            }
          />
        </FormField>
        <p className="text-xs text-gray-500 mt-1">
          {t('inlineClass.studentsHint')}
        </p>
      </div>

      {apiError && (
        <p role="alert" className="text-[11px] text-red-500">
          {apiError}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="gradient"
          className="h-10 px-5"
          onClick={() => void formik.submitForm()}
          loading={formik.isSubmitting}
          disabled={formik.isSubmitting}
          loadingText={t('inlineClass.creating')}
        >
          {t('inlineClass.create')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-10 px-5"
          onClick={onCancel}
          disabled={formik.isSubmitting}
        >
          {t('inlineClass.cancel')}
        </Button>
      </div>
    </div>
  );
}
