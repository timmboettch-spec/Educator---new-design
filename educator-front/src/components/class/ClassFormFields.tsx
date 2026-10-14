import dayjs from 'dayjs';
import type { FormikProps } from 'formik';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import {
  CommonStatus,
  SELECTABLE_CLASS_STATUSES,
  type SelectableClassStatus,
} from '../../redux/api/classes/classes.types';
import type { ClassFormValues } from '../../types/Class_types';
import { computeClassStatus } from '../../utils/classUtils';
import {
  CLASS_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  sanitizeClassNameForSubmission,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from '../../utils/inputSecurity';
import SelectField from '../ui/Select';

export interface EducatorSchool {
  id: string;
  school_name: string;
}

type ClassNameSubmitResult =
  | { className: string; errorKey?: never }
  | {
      className?: never;
      errorKey:
        'form.errors.classNameRequired' | 'form.errors.classNameUnsafeContent';
    };

/**
 * Final class-name check run on submit (after Yup): sanitizes the name and
 * rejects anything that still looks like markup, SQL or code.
 */
export const getSubmittableClassName = (
  rawName: string
): ClassNameSubmitResult => {
  const className = sanitizeClassNameForSubmission(rawName);
  if (!className) return { errorKey: 'form.errors.classNameRequired' };
  if (
    hasUnsafeMarkupOrScriptPattern(className) ||
    hasDisallowedClassNameChars(className) ||
    hasSqlInjectionLikePattern(className) ||
    hasBlockedCodingKeyword(className) ||
    hasCodeLikeSyntaxPattern(className)
  ) {
    return { errorKey: 'form.errors.classNameUnsafeContent' };
  }
  return { className };
};

interface ClassFormFieldsProps {
  formik: FormikProps<ClassFormValues>;
  educatorSchools: EducatorSchool[];
  isSchoolRequired: boolean;
  /** Disables both date pickers (e.g. editing a class that has already started). */
  isDateLocked: boolean;
}

/** Fields shared by the create and edit class modals: school, name, dates, status. */
export const ClassFormFields = ({
  formik,
  educatorSchools,
  isSchoolRequired,
  isDateLocked,
}: ClassFormFieldsProps) => {
  const { t } = useTranslation('classManagement');

  // Auto-update status whenever start_date or end_date changes.
  // Preserve ARCHIEVED; start date drives ACTIVE vs INACTIVE
  // (today/past → Active; future → Inactive; past end → Inactive).
  // With the dates as loaded, the loaded status stands, so opening the edit
  // form doesn't re-activate a class that was set to INACTIVE by hand.
  useEffect(() => {
    const { status, start_date, end_date } = formik.values;
    if (status === 'ARCHIEVED') return;
    if (!start_date) return;
    const hasInitialDates =
      start_date === formik.initialValues.start_date &&
      end_date === formik.initialValues.end_date;
    const next = hasInitialDates
      ? formik.initialValues.status
      : computeClassStatus(start_date, end_date);
    if (next && status !== next) {
      formik.setFieldValue('status', next);
    }
  }, [formik.values.start_date, formik.values.end_date]);

  const today = dayjs().format('YYYY-MM-DD');

  const statusLabels: Record<SelectableClassStatus, string> = {
    [CommonStatus.ACTIVE]: t('table.status.active'),
    [CommonStatus.INACTIVE]: t('table.status.inactive'),
    [CommonStatus.ARCHIEVED]: t('table.status.archived'),
  };

  const getDateMin = (field: 'start_date' | 'end_date') => {
    if (field === 'end_date' && formik.values.start_date) {
      return dayjs(formik.values.start_date.split('T')[0])
        .add(1, 'day')
        .format('YYYY-MM-DD');
    }
    return today;
  };

  const isActiveAllowed =
    computeClassStatus(formik.values.start_date, formik.values.end_date) ===
    'ACTIVE';

  return (
    <>
      {educatorSchools.length >= 1 && (
        <FormField
          label={t('form.fieldSchool')}
          required={isSchoolRequired}
          error={formik.touched.school_id ? formik.errors.school_id : undefined}
        >
          <SelectField
            value={formik.values.school_id}
            onChange={(value: string) => {
              void formik.setFieldValue('school_id', value);
              void formik.setFieldTouched('school_id', true, false);
            }}
            placeholder={t('form.placeholderSchool')}
            options={educatorSchools.map((s) => ({
              value: s.id,
              label: s.school_name,
            }))}
          />
        </FormField>
      )}

      <FormField
        label={t('form.fieldClassName')}
        required
        error={formik.touched.class_name ? formik.errors.class_name : undefined}
      >
        <Input
          name="class_name"
          data-testid="input-class_name"
          placeholder={t('form.placeholderClassName')}
          value={formik.values.class_name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const sanitizedTypingValue = sanitizeTextForTyping(
              e.target.value,
              CLASS_NAME_MAX_LENGTH
            );
            formik.setFieldValue('class_name', sanitizedTypingValue);
          }}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            const trimmedValue = trimBoundaryWhitespace(e.target.value);
            if (trimmedValue !== formik.values.class_name) {
              formik.setFieldValue('class_name', trimmedValue, false);
            }
            formik.handleBlur(e);
          }}
        />
      </FormField>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          {t('form.fieldAutoDates')} <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['start_date', 'end_date'] as const).map((field) => {
            const displayVal = formik.values[field]
              ? dayjs(formik.values[field].split('T')[0]).format('MM-DD-YYYY')
              : '';
            return (
              <div key={field}>
                <p className="text-xs text-gray-500 font-medium mb-1">
                  {field === 'start_date'
                    ? t('form.fieldStartDate')
                    : t('form.fieldEndDate')}
                </p>
                <div
                  data-date-field={field}
                  className={`relative h-[38px] rounded-xl overflow-hidden border-2 transition-colors focus:outline-none ${
                    isDateLocked
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100'
                      : 'cursor-pointer border-gray-300 focus:border-primary-400'
                  }`}
                  tabIndex={isDateLocked ? -1 : 0}
                  role="button"
                  aria-label={
                    field === 'start_date'
                      ? t('form.ariaPickStartDate')
                      : t('form.ariaPickEndDate')
                  }
                  aria-disabled={isDateLocked}
                  onBlur={(e) => {
                    const relatedTarget = e.relatedTarget as HTMLElement | null;

                    const movingToOtherDateField =
                      !!relatedTarget?.closest('[data-date-field]');
                    if (
                      !e.currentTarget.contains(relatedTarget) &&
                      !movingToOtherDateField
                    ) {
                      formik.setFieldTouched(field, true);
                    }
                  }}
                  onClick={(e) => {
                    if (isDateLocked) return;
                    const dateInput = e.currentTarget.querySelector(
                      'input[type="date"]'
                    ) as HTMLInputElement;
                    if (dateInput) {
                      dateInput.focus();
                      dateInput.showPicker?.();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isDateLocked) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const dateInput = e.currentTarget.querySelector(
                        'input[type="date"]'
                      ) as HTMLInputElement;
                      if (dateInput) {
                        dateInput.focus();
                        dateInput.showPicker?.();
                      }
                    }
                  }}
                >
                  <Input
                    type="text"
                    placeholder={t('form.datePlaceholder')}
                    value={displayVal}
                    readOnly
                    tabIndex={-1}
                    inputClassName="!border-0 shadow-none"
                    className={`w-full h-full text-sm bg-transparent pointer-events-none ${
                      isDateLocked ? 'text-gray-400' : ''
                    }`}
                  />
                  <Input
                    type="date"
                    min={getDateMin(field)}
                    disabled={isDateLocked}
                    tabIndex={-1}
                    value={
                      formik.values[field]
                        ? formik.values[field].split('T')[0]
                        : ''
                    }
                    onChange={(e) => {
                      const newVal = e.target.value;
                      formik.setFieldValue(field, newVal);
                      if (field === 'start_date' && formik.values.end_date) {
                        if (
                          newVal &&
                          new Date(newVal) >= new Date(formik.values.end_date)
                        ) {
                          formik.setFieldValue('end_date', '');
                          formik.setFieldTouched('end_date', false, false);
                        }
                      }
                      const wrapper = (e.target as HTMLElement).closest(
                        '[role="button"]'
                      ) as HTMLElement | null;
                      if (field === 'start_date') {
                        const endWrapper = wrapper
                          ?.closest('.grid')
                          ?.querySelector<HTMLElement>(
                            '[data-date-field="end_date"]'
                          );
                        endWrapper?.focus();
                      } else {
                        wrapper?.focus();
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                  />
                </div>
                {formik.touched[field] && formik.errors[field] && (
                  <p className="text-[10px] text-red-500 mt-0.5">
                    {formik.errors[field]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {isDateLocked && <p className="text-[10px] text-gray-400 mt-0.5"></p>}
      </div>

      <SelectField
        label={t('filters.status')}
        required
        value={formik.values.status}
        onChange={(val) => formik.setFieldValue('status', val)}
        options={SELECTABLE_CLASS_STATUSES.map((status) => ({
          label: statusLabels[status],
          value: status,
          disabled: status === CommonStatus.ACTIVE && !isActiveAllowed,
        }))}
        error={formik.touched.status ? formik.errors.status : undefined}
      />
    </>
  );
};
