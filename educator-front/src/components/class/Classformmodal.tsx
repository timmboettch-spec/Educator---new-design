import { useFormik } from 'formik';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Yup from 'yup';
import dayjs from 'dayjs';
import { toast } from '../common/Toast';
import { Button } from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { getParsedUser } from '../../utils/storage';

import type { ClassFormValues } from '../../types/Class_types';
import type { Class, ModalMode } from '../../types/Class_types';
import { CLASS_VALIDATION } from '../../utils/messages/class';
import { computeClassStatus } from '../../utils/classUtils';
import {
  CLASS_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  normalizePlainTextInput,
  sanitizeClassNameForSubmission,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from '../../utils/inputSecurity';
import SelectField from '../ui/Select';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface ClassFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalMode: ModalMode;
  selectedClass: Class | null;
  deleteStatus: string;
  onConfirmDelete: () => void;
  onSubmit: (
    values: ClassFormValues,
    studentMode: 'import' | 'manual' | null,
    selectedFile: File | null,
    setFileError: (msg: string | null) => void,
  ) => Promise<void>;
}

export default function ClassFormModal({
  isOpen,
  onClose,
  modalMode,
  selectedClass,
  deleteStatus,
  onConfirmDelete,
  onSubmit,
}: ClassFormModalProps) {
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const classLocale = locale.classes;

  const parsedUser = getParsedUser();
  const educatorSchools: Array<{ id: string; school_name: string }> =
    (parsedUser as Record<string, unknown> | null)?.schools as Array<{ id: string; school_name: string }> ?? [];
  // Roster import was removed — students are only ever added via a manual count.
  const [studentMode, setStudentMode] = useState<'manual' | null>(null);
  const [assignCount, setAssignCount] = useState('');

  const formik = useFormik<ClassFormValues>({
    enableReinitialize: true,
    initialValues: {
      school_id: selectedClass?.school_id || (educatorSchools.length === 1 ? educatorSchools[0].id : ''),
      class_name: selectedClass?.class_name || '',
      status: !selectedClass
        ? 'ACTIVE'
        : selectedClass.status === 'DRAFT' || selectedClass.status === 'ARCHIEVED' || selectedClass.status === 'INACTIVE'
          ? selectedClass.status
          : computeClassStatus(selectedClass.start_date, selectedClass.end_date),
      start_date: selectedClass?.start_date ? selectedClass.start_date.split('T')[0] : '',
      end_date: selectedClass?.end_date ? selectedClass.end_date.split('T')[0] : '',
      total_no_of_students: '',
    },
    validationSchema: Yup.object({
      school_id: Yup.string().when([], {
        is: () => modalMode === 'create' && educatorSchools.length >= 1,
        then: (s) => s.required('Please select a school'),
        otherwise: (s) => s.optional(),
      }),
      class_name: Yup.string()
        .transform((value) => normalizePlainTextInput(value ?? '', CLASS_NAME_MAX_LENGTH))
        .required(CLASS_VALIDATION.NAME_REQUIRED)
        .min(3, 'Class name must be at least 3 characters')
        .max(CLASS_NAME_MAX_LENGTH, 'Class name must be at most 50 characters')
        .test(
          'safe-class-name-pattern',
          'Class name cannot include HTML or script-like content',
          (value) => !value || !hasUnsafeMarkupOrScriptPattern(value),
        )
        .test(
          'allowed-class-name-characters',
          'Class name cannot include < or > characters',
          (value) => !value || !hasDisallowedClassNameChars(value),
        )
        .test(
          'sql-injection-pattern',
          'Class name looks like a query. Please enter a normal class name.',
          (value) => !value || !hasSqlInjectionLikePattern(value),
        )
        .test(
          'blocked-coding-keyword',
          'Class name cannot include coding or scripting keywords.',
          (value) => !value || !hasBlockedCodingKeyword(value),
        )
        .test(
          'code-like-syntax',
          'Class name cannot include code-like syntax.',
          (value) => !value || !hasCodeLikeSyntaxPattern(value),
        ),
      start_date: Yup.string()
        .matches(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')
        .required(CLASS_VALIDATION.STARTDATE)
        .test('no-past-start', 'Start date cannot be in the past', (value) => {
          if (!value || modalMode === 'edit') return true;
          return dayjs(value).isSame(dayjs(), 'day') || dayjs(value).isAfter(dayjs(), 'day');
        }),
      end_date: Yup.string()
        .matches(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
        .required(CLASS_VALIDATION.ENDDATE)
        .test('no-past-end', 'End date cannot be in the past', (value) => {
          if (!value || modalMode === 'edit') return true;
          return dayjs(value).isSame(dayjs(), 'day') || dayjs(value).isAfter(dayjs(), 'day');
        })
        .test('end-after-start', CLASS_VALIDATION.STARTDATE_BEFORE_ENDDATE, function (value) {
          const { start_date } = this.parent;
          if (!start_date || !value) return true;
          return new Date(value) > new Date(start_date);
        }),
      total_no_of_students: Yup.string().test(
        'required-if-manual',
        'Student count is required',
        (value) => studentMode !== 'manual' || (!!value && /^[0-9]+$/.test(value)),
      ),
    }),
    onSubmit: async (values, helpers) => {
      const sanitizedClassName = sanitizeClassNameForSubmission(values.class_name);

      if (!sanitizedClassName) {
        helpers.setFieldError('class_name', CLASS_VALIDATION.NAME_REQUIRED);
        return;
      }

      if (
        hasUnsafeMarkupOrScriptPattern(sanitizedClassName) ||
        hasDisallowedClassNameChars(sanitizedClassName) ||
        hasSqlInjectionLikePattern(sanitizedClassName) ||
        hasBlockedCodingKeyword(sanitizedClassName) ||
        hasCodeLikeSyntaxPattern(sanitizedClassName)
      ) {
        helpers.setFieldError(
          'class_name',
          'Class name contains unsafe content. Please enter plain text only.',
        );
        return;
      }

      // In edit mode, check if anything actually changed
      if (modalMode === 'edit' && selectedClass) {
        const originalName = selectedClass.class_name ?? '';
        const originalStart = selectedClass.start_date?.split('T')[0] ?? '';
        const originalEnd = selectedClass.end_date?.split('T')[0] ?? '';
        const originalStatus =
          selectedClass.status === 'DRAFT' || selectedClass.status === 'ARCHIEVED' || selectedClass.status === 'INACTIVE'
            ? selectedClass.status
            : computeClassStatus(selectedClass.start_date, selectedClass.end_date);
        const originalSchoolId = selectedClass.school_id ?? '';
        const noChanges =
          sanitizedClassName === originalName &&
          values.start_date === originalStart &&
          values.end_date === originalEnd &&
          values.status === originalStatus &&
          (values.school_id ?? '') === originalSchoolId;
        if (noChanges) {
          toast.error(classLocale.deleteNoChangesApplied ?? 'No changes applied.');
          return;
        }
      }

      const safeValues: ClassFormValues = {
        ...values,
        class_name: sanitizedClassName,
      };

      await onSubmit(safeValues, studentMode, null, () => {});
    },
  });

  // Auto-update status whenever start_date or end_date changes.
  // Preserve DRAFT/ARCHIEVED; start date drives ACTIVE vs INACTIVE
  // (today/past → Active; future → Inactive; past end → Inactive).
  useEffect(() => {
    const current = formik.values.status;
    if (current === 'DRAFT' || current === 'ARCHIEVED') return;
    if (!formik.values.start_date) return;
    const computed = computeClassStatus(formik.values.start_date, formik.values.end_date);
    if (current !== computed) {
      formik.setFieldValue('status', computed);
    }
  }, [formik.values.start_date, formik.values.end_date]);

  const today = dayjs().format('YYYY-MM-DD');

  const getDateMin = (field: 'start_date' | 'end_date') => {
    if (field === 'end_date' && formik.values.start_date) {
      return dayjs(formik.values.start_date.split('T')[0]).add(1, 'day').format('YYYY-MM-DD');
    }
    return today;
  };

  const handleClose = () => {
    formik.resetForm();
    setStudentMode(null);
    onClose();
  };

  useEffect(() => {
    if (isOpen && modalMode === 'create') {
      formik.resetForm();
      setStudentMode(null);
    }
  }, [isOpen]);

  if (modalMode === 'delete') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title=""
        footer={
          <div className="flex gap-4">
            <Button variant="secondary" onClick={handleClose} className="w-1/2 h-11 rounded-full">
              {classLocale.back}
            </Button>
            <Button
              onClick={onConfirmDelete}
              disabled={deleteStatus === 'loading'}
              className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90"
            >
              {deleteStatus === 'loading'
                ? classLocale.deleting ?? 'Deleting...'
                : classLocale.deleteAction ?? 'Delete'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-base font-semibold mb-2">
            {classLocale.modalDeleteTitle ?? 'Delete Class'}
          </h2>
          <p className="text-sm font-medium text-gray-700 mb-1">{selectedClass?.class_name}</p>
          <p className="text-sm text-gray-500">{classLocale.deleteConfirm ?? 'Are you sure you want to delete this class?'}</p>
        </div>
      </Modal>
    );
  }

  if (modalMode === 'assign') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={classLocale.fieldStudents}
        footer={
          <Button variant="secondary" onClick={handleClose} className="w-1/2 h-11 rounded-full">
            {classLocale.back}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {['class_name'].map((field) => (
            <FormField
              key={field}
              label={field.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              required={field === 'class_name'}
            >
              <Input
                name={field}
                value={
                  (selectedClass?.[field as keyof typeof selectedClass] as string | number) || ''
                }
                readOnly
                className="bg-gray-100"
              />
            </FormField>
          ))}
          <FormField label="Total Number Of Students">
            <Input
              name="assign_count"
              type="number"
              placeholder={classLocale.placeholderStudentCount}
              value={assignCount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignCount(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        modalMode === 'create'
          ? classLocale.modalCreateTitle ?? classLocale.createClass ?? 'Create Class'
          : classLocale.modalEditTitle ?? 'Edit Class'
      }
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            className="w-1/2 h-11 rounded-full"
          >
            {classLocale.back}
          </Button>
          <Button
            type="submit"
            form="class-form"
            disabled={formik.isSubmitting}
            className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 disabled:opacity-60"
          >
            {formik.isSubmitting
              ? classLocale.saving ?? 'Saving...'
              : modalMode === 'create'
                ? classLocale.createClass ?? 'Create Class'
                : classLocale.updateClass ?? 'Update Class'}
          </Button>
        </div>
      }
    >
      <form id="class-form" onSubmit={formik.handleSubmit} className="flex flex-col gap-5">
        {/* Hidden submit button ensures Enter key triggers form submission in all browsers */}
        <button type="submit" aria-hidden="true" className="hidden" tabIndex={-1} />

        {/* School selector - shown when educator has at least one school (both create and edit) */}
        {(modalMode === 'create' || modalMode === 'edit') && educatorSchools.length >= 1 && (
          <FormField
            label="School"
            required={modalMode === 'create'}
            error={formik.touched.school_id ? formik.errors.school_id : undefined}
          >
            <SelectField
              value={formik.values.school_id}
              onChange={(value: string) => {
                void formik.setFieldValue('school_id', value);
                void formik.setFieldTouched('school_id', true, false);
              }}
              placeholder="Select a school"
              options={educatorSchools.map((s) => ({ value: s.id, label: s.school_name }))}
            />
          </FormField>
        )}

        <FormField
          label={classLocale.fieldClassName}
          required
          error={formik.touched.class_name ? formik.errors.class_name : undefined}
        >
          <Input
            name="class_name"
            data-testid="input-class_name"
            placeholder={classLocale.placeholderClassName}
            value={formik.values.class_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const sanitizedTypingValue = sanitizeTextForTyping(
                e.target.value,
                CLASS_NAME_MAX_LENGTH,
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

        <div
          className="flex flex-col gap-1.5"
          role="group"
          aria-labelledby="class-auto-dates-label"
        >
          <span
            id="class-auto-dates-label"
            className="text-sm font-medium text-gray-700"
          >
            {classLocale.fieldAutoDates} <span className="text-red-500">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['start_date', 'end_date'] as const).map((field) => {
              const isEditModeDateLocked =
                modalMode === 'edit' &&
                !dayjs(selectedClass?.start_date?.split('T')[0]).isAfter(dayjs(), 'day');
              const isDateDisabled = isEditModeDateLocked;
              const displayVal = formik.values[field]
                ? dayjs(formik.values[field].split('T')[0]).format('MM-DD-YYYY')
                : '';
              return (
                <div key={field}>
                  <p className="text-xs text-gray-500 font-medium mb-1">
                    {field === 'start_date' ? classLocale.fieldStartDate : classLocale.fieldEndDate}
                  </p>
                  <div
                    data-date-field={field}
                    className={`relative h-[38px] rounded-xl overflow-hidden border-2 transition-colors focus:outline-none ${
                      isDateDisabled
                        ? 'cursor-not-allowed border-gray-200 bg-gray-100'
                        : 'cursor-pointer border-gray-300 focus:border-primary-400'
                    }`}
                    tabIndex={isDateDisabled ? -1 : 0}
                    role="button"
                    aria-label={
                      field === 'start_date'
                        ? classLocale.ariaPickStartDate
                        : classLocale.ariaPickEndDate
                    }
                    aria-disabled={isDateDisabled}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement | null;

                      const movingToOtherDateField = !!relatedTarget?.closest('[data-date-field]');
                      if (!e.currentTarget.contains(relatedTarget) && !movingToOtherDateField) {
                        formik.setFieldTouched(field, true);
                      }
                    }}
                    onClick={(e) => {
                      if (isDateDisabled) return;
                      const dateInput = e.currentTarget.querySelector(
                        'input[type="date"]',
                      ) as HTMLInputElement;
                      if (dateInput) {
                        dateInput.focus();
                        dateInput.showPicker?.();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (isDateDisabled) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const dateInput = e.currentTarget.querySelector(
                          'input[type="date"]',
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
                      placeholder="MM-DD-YYYY"
                      value={displayVal}
                      readOnly
                      tabIndex={-1}
                      inputClassName="!border-0 shadow-none"
                      className={`w-full h-full text-sm bg-transparent pointer-events-none ${
                        isDateDisabled ? 'text-gray-500' : ''
                      }`}
                    />
                    <Input
                      type="date"
                      min={getDateMin(field)}
                      disabled={isDateDisabled}
                      tabIndex={-1}
                      value={formik.values[field] ? formik.values[field].split('T')[0] : ''}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        formik.setFieldValue(field, newVal);
                        if (field === 'start_date' && formik.values.end_date) {
                          if (newVal && new Date(newVal) >= new Date(formik.values.end_date)) {
                            formik.setFieldValue('end_date', '');
                            formik.setFieldTouched('end_date', false, false);
                          }
                        }
                        const wrapper = (e.target as HTMLElement).closest(
                          '[role="button"]',
                        ) as HTMLElement | null;
                        if (field === 'start_date') {
                          const endWrapper = wrapper
                            ?.closest('.grid')
                            ?.querySelector<HTMLElement>('[data-date-field="end_date"]');
                          endWrapper?.focus();
                        } else {
                          wrapper?.focus();
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                    />
                  </div>
                  {formik.touched[field] && formik.errors[field] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{formik.errors[field]}</p>
                  )}
                </div>
              );
            })}
          </div>
          {modalMode === 'edit' &&
            !dayjs(selectedClass?.start_date?.split('T')[0]).isAfter(dayjs(), 'day') && (
              <p className="text-[10px] text-gray-500 mt-0.5"></p>
            )}
        </div>

        {(() => {
          const dateStatus = computeClassStatus(formik.values.start_date, formik.values.end_date);
          const isActive = dateStatus === 'ACTIVE';
          return (
            <SelectField
              label={classLocale.filterStatus}
              required
              value={formik.values.status}
              onChange={(val) => formik.setFieldValue('status', val)}
              options={[
                { label: classLocale.statusActive, value: 'ACTIVE', disabled: !isActive },
                { label: classLocale.statusInactive, value: 'INACTIVE' },
                { label: classLocale.statusDraft, value: 'DRAFT' },
                { label: classLocale.statusArchived, value: 'ARCHIEVED' },
              ]}
              error={formik.touched.status ? formik.errors.status : undefined}
            />
          );
        })()}

        {modalMode === 'create' && (
          <FormField label={classLocale.fieldStudents}>
            <div className="flex flex-col gap-1">
              <Input
                name="total_no_of_students"
                type="text"
                placeholder={classLocale.placeholderStudentCount}
                value={formik.values.total_no_of_students}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^\d*$/.test(value)) {
                    formik.setFieldValue('total_no_of_students', value);
                    setStudentMode(value ? 'manual' : null);
                  }
                }}
                onKeyDown={(e) => {
                  if (['-', '+', 'e', 'E', '.'].includes(e.key)) e.preventDefault();
                }}
                inputClassName="appearance-none"
                error={
                  formik.touched.total_no_of_students
                    ? formik.errors.total_no_of_students
                    : undefined
                }
              />
            </div>
          </FormField>
        )}
      </form>
    </Modal>
  );
}
