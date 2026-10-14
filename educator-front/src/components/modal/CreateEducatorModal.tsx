import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import {
  EDUCATOR_NAME_MAX_LENGTH,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from '../../utils/inputSecurity';
import { type FormikProps } from 'formik';
import { Button } from '../ui/Button';
import SelectField from '../ui/Select';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { useEffect, useRef, useState } from 'react';
import type { Educator, SchoolSummary } from '../../types';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type EducatorModalProps = {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalMode: 'create' | 'view' | 'edit';
  schools: { id: string; school_name: string; status: string }[];
  isSubmitting: boolean;
  tokensInput: string;
  setTokensInput: (value: string) => void;
  selectedEducator?: Educator | null;
  onAddSchool?: (educatorId: string, schoolId: string) => Promise<void>;
  onRemoveSchool?: (educatorId: string, schoolId: string) => Promise<void>;
  onAdditionalSchoolsChange?: (additionalSchoolIds: string[]) => void;
  onSchoolChanges?: (currentSchoolIds: string[]) => void;
  adminAvailableSeats?: number;
  removeSeatsInput?: string;
  setRemoveSeatsInput?: (value: string) => void;
  formik: FormikProps<{
    full_name: string;
    email: string;
    status: string;
    tokens: number;
    school_id: string;
  }>;
};

export default function CreateEducatorModal({
  isModalOpen,
  setIsModalOpen,
  modalMode,
  schools,
  isSubmitting,
  formik,
  tokensInput,
  setTokensInput,
  selectedEducator,
  onAdditionalSchoolsChange,
  onSchoolChanges,
  adminAvailableSeats,
  removeSeatsInput,
  setRemoveSeatsInput,
}: EducatorModalProps) {
  const [localSchools, setLocalSchools] = useState<SchoolSummary[]>(() =>
    modalMode === 'create' ? [] : (selectedEducator?.schools ?? [])
  );
  const tokenErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isModalOpen) {
      if (modalMode === 'edit' || modalMode === 'view') {
        setLocalSchools(selectedEducator?.schools ?? []);
      } else {
        setLocalSchools([]);
        onAdditionalSchoolsChange?.([]);
      }
    }
  }, [isModalOpen, modalMode, selectedEducator]);
  useEffect(() => {
    if (
      formik.errors.tokens &&
      (formik.touched.tokens || formik.submitCount > 0)
    ) {
      tokenErrorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [formik.errors.tokens, formik.touched.tokens, formik.submitCount]);

  if (!isModalOpen) return null;

  const handleRemoveSchool = (schoolId: string) => {
    const updated = localSchools.filter((s) => s.id !== schoolId);
    setLocalSchools(updated);
    if (modalMode === 'create') {
      formik.setFieldValue('school_id', updated[0]?.id ?? '');
      onAdditionalSchoolsChange?.(updated.slice(1).map((s) => s.id));
    } else {
      // edit mode: local only — API applied on "Update Educator" submit
      onSchoolChanges?.(updated.map((s) => s.id));
    }
  };

  const handleAddSchool = (schoolId: string) => {
    if (!schoolId) return;
    const added = schools.find((s) => s.id === schoolId);
    if (!added) return;
    const updated = [
      ...localSchools,
      { id: added.id, school_name: added.school_name },
    ];
    setLocalSchools(updated);
    if (modalMode === 'create') {
      if (updated.length === 1) formik.setFieldValue('school_id', added.id);
      onAdditionalSchoolsChange?.(updated.slice(1).map((s) => s.id));
    } else {
      // edit mode: local only — API applied on "Update Educator" submit
      onSchoolChanges?.(updated.map((s) => s.id));
    }
  };

  const availableToAdd = schools
    .filter(
      (s) =>
        s.status !== 'INACTIVE' && !localSchools.some((ls) => ls.id === s.id)
    )
    .sort((a, b) => a.school_name.localeCompare(b.school_name));

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const educatorsCopy = {
    modalCreateTitle: locale?.educators?.modalCreateTitle ?? 'Create Educator',
    modalEditTitle: locale?.educators?.modalEditTitle ?? 'Edit Educator',
    modalViewTitle: locale?.educators?.modalViewTitle ?? 'View Educator',
    back: locale?.educators?.back ?? 'Back',
    addEducator: locale?.educators?.addEducator ?? 'Add Educator',
    updateEducator: locale?.educators?.updateEducator ?? 'Update Educator',
    fieldEducatorName: locale?.educators?.fieldEducatorName ?? 'Educator Name',
    fieldEducatorEmail:
      locale?.educators?.fieldEducatorEmail ?? 'Educator Email',
    fieldSchool: locale?.educators?.fieldSchool ?? 'School',
    fieldStatus: locale?.educators?.fieldStatus ?? 'Status',
    fieldSeats: locale?.educators?.fieldSeats ?? 'Seats',
    fieldAddSeats: locale?.educators?.fieldAddSeats ?? 'Add Seats',
    saving: locale?.educators?.saving ?? 'Saving...',
    educatorSeatsTitle:
      locale?.educators?.educatorSeatsTitle ?? 'Educator Seats',
    totalSeats: locale?.account?.totalSeats ?? 'Total Seats',
    usedSeats: locale?.account?.usedSeats ?? 'Used Seats',
    remainingSeats: locale?.account?.remainingSeats ?? 'Remaining Seats',
    placeholderEducatorName:
      locale?.educators?.placeholderEducatorName ?? 'Enter educator name',
    placeholderEducatorEmail:
      locale?.educators?.placeholderEducatorEmail ?? 'Enter Educator Email',
    placeholderSelectSchool:
      locale?.educators?.placeholderSelectSchool ?? 'Select school',
    placeholderSelectStatus:
      locale?.educators?.placeholderSelectStatus ?? 'Select status',
    placeholderAddSeats:
      locale?.educators?.placeholderAddSeats ?? 'Enter additional seats to add',
    placeholderEducatorSeats:
      locale?.educators?.placeholderEducatorSeats ?? 'Enter Educator seats',
    statusPending: locale?.educators?.statusPending ?? 'Pending',
    statusActive: locale?.educators?.statusActive ?? 'Active',
    statusInactive: locale?.educators?.statusInactive ?? 'Inactive',
    removeSeats: locale?.educators?.removeSeats ?? 'Remove Seats',
    removeSeatsError:
      locale?.educators?.removeSeatsError ??
      'Cannot add and remove seats at the same time',
    cannotExceedAvailableSeats:
      locale?.educators?.cannotExceedAvailableSeats ??
      'Cannot exceed available seats',
    emailValidationMissing:
      language === 'es'
        ? "Por favor, incluya un '@' en la dirección de correo electrónico."
        : "Please include an '@' in the email address.",
    emailValidationInvalid:
      language === 'es'
        ? 'Por favor, ingrese una dirección de correo electrónico válida.'
        : 'Please enter a valid email address.',
    addAnotherSchool:
      locale?.educators?.addAnotherSchool ?? '+ Add another school',
    noSchoolSelectedYet:
      locale?.educators?.noSchoolSelectedYet ?? 'No school selected yet',
    noSchoolsAssigned:
      locale?.educators?.noSchoolsAssigned ?? 'No schools assigned',
    currentlyAvailableToAdd:
      locale?.educators?.currentlyAvailableToAdd ??
      'Currently available to add:',
    seatsLabel: locale?.educators?.seats ?? 'seats',
    max: locale?.educators?.max ?? 'Max',
  };

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      title={
        modalMode === 'create'
          ? educatorsCopy.modalCreateTitle
          : modalMode === 'edit'
            ? educatorsCopy.modalEditTitle
            : educatorsCopy.modalViewTitle
      }
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsModalOpen(false)}
            className={`h-11 rounded-full text-sm font-medium ${modalMode === 'view' ? 'w-full' : 'w-1/2'}`}
          >
            {educatorsCopy.back}
          </Button>
          {modalMode !== 'view' && (
            <Button
              type="submit"
              form="educator-form"
              loading={isSubmitting}
              loadingText={educatorsCopy.saving}
              className="w-1/2 h-11 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
            >
              {modalMode === 'create'
                ? educatorsCopy.addEducator
                : educatorsCopy.updateEducator}
            </Button>
          )}
        </div>
      }
    >
      <form
        id="educator-form"
        onSubmit={formik.handleSubmit}
        className="flex flex-col gap-5"
      >
        {/* Hidden submit button ensures Enter key triggers form submission in all browsers */}
        <button
          type="submit"
          aria-hidden="true"
          className="hidden"
          tabIndex={-1}
        />

        {/* Educator seat summary — edit mode only */}
        {modalMode === 'edit' && selectedEducator && (
          <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3">
            <p className="text-xs font-semibold text-black uppercase tracking-wide mb-2">
              {educatorsCopy.educatorSeatsTitle}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="text-gray-600">
                {educatorsCopy.totalSeats}:{' '}
                <span className="font-semibold text-gray-900">
                  {selectedEducator.totalTokens ?? 0}
                </span>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                {educatorsCopy.usedSeats}:{' '}
                <span className="font-semibold text-gray-900">
                  {selectedEducator.tokensUsed ?? 0}
                </span>
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">
                {educatorsCopy.remainingSeats}:{' '}
                <span className="font-semibold text-[#F97316]">
                  {selectedEducator.remainingTokens ?? 0}
                </span>
              </span>
            </div>
          </div>
        )}
        <FormField
          label={educatorsCopy.fieldEducatorName}
          required={modalMode !== 'view'}
          error={
            (formik.touched.full_name ||
              formik.submitCount > 0 ||
              formik.values.full_name.length > 50) &&
            formik.errors.full_name
              ? (formik.errors.full_name as string)
              : undefined
          }
        >
          <Input
            name="full_name"
            value={formik.values.full_name}
            onChange={(e) => {
              const sanitized = sanitizeTextForTyping(
                e.target.value,
                EDUCATOR_NAME_MAX_LENGTH
              );
              formik.setFieldValue('full_name', sanitized);
            }}
            onBlur={(e) => {
              const trimmed = trimBoundaryWhitespace(e.target.value);
              if (trimmed !== formik.values.full_name) {
                formik.setFieldValue('full_name', trimmed, false);
              }
              formik.handleBlur(e);
            }}
            disabled={modalMode === 'view'}
            placeholder={educatorsCopy.placeholderEducatorName}
          />
        </FormField>

        <FormField
          label={educatorsCopy.fieldEducatorEmail}
          required={modalMode !== 'view'}
          error={
            (formik.touched.email || formik.submitCount > 0) &&
            formik.errors.email
              ? (formik.errors.email as string)
              : undefined
          }
        >
          <Input
            name="email"
            type="email"
            value={formik.values.email}
            onChange={(e) => {
              e.target.setCustomValidity('');
              formik.handleChange(e);
            }}
            onBlur={formik.handleBlur}
            onInvalid={(e) => {
              const input = e.target as HTMLInputElement;
              if (input.validity.valueMissing) {
                input.setCustomValidity(educatorsCopy.emailValidationMissing);
              } else if (
                input.validity.typeMismatch ||
                input.validity.patternMismatch
              ) {
                input.setCustomValidity(educatorsCopy.emailValidationInvalid);
              }
            }}
            disabled={modalMode !== 'create'}
            placeholder={educatorsCopy.placeholderEducatorEmail}
          />
        </FormField>

        <FormField
          label={educatorsCopy.fieldSchool}
          required={modalMode === 'create'}
          error={
            formik.submitCount > 0 && formik.errors.school_id
              ? (formik.errors.school_id as string)
              : undefined
          }
        >
          {modalMode === 'view' ? (
            <div className="flex flex-wrap gap-2 min-h-[2.75rem] px-1 py-1">
              {localSchools.length > 0 ? (
                localSchools.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1 rounded-full text-sm"
                  >
                    {s.school_name}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-sm">—</span>
              )}
            </div>
          ) : (
            // create and edit modes share the same multi-school pill UI
            <div className="relative flex flex-col gap-2">
              <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
                {localSchools.length > 0 ? (
                  localSchools.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1 rounded-full text-sm"
                    >
                      {s.school_name}
                      {(modalMode === 'create'
                        ? true
                        : localSchools.length > 1) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSchool(s.id)}
                          className="w-4 h-4 flex items-center justify-center rounded-full text-orange-400 hover:text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
                          aria-label={`Remove ${s.school_name}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 text-sm">
                    {modalMode === 'create'
                      ? educatorsCopy.noSchoolSelectedYet
                      : educatorsCopy.noSchoolsAssigned}
                  </span>
                )}
              </div>
              {availableToAdd.length > 0 && (
                <SelectField
                  options={availableToAdd.map((s) => ({
                    value: s.id,
                    label: s.school_name,
                  }))}
                  value=""
                  onChange={handleAddSchool}
                  placeholder={
                    localSchools.length === 0
                      ? educatorsCopy.placeholderSelectSchool
                      : educatorsCopy.addAnotherSchool
                  }
                />
              )}
            </div>
          )}
        </FormField>

        <FormField
          label={educatorsCopy.fieldStatus}
          required={modalMode !== 'view'}
        >
          {modalMode === 'view' ? (
            <Input
              value={
                formik.values.status === 'ACTIVE'
                  ? educatorsCopy.statusActive
                  : formik.values.status === 'INACTIVE'
                    ? educatorsCopy.statusInactive
                    : educatorsCopy.statusPending
              }
              disabled
              className="h-11 rounded-xl w-full cursor-not-allowed"
            />
          ) : (
            <SelectField
              options={[
                ...(formik.values.status === 'PENDING'
                  ? [{ value: 'PENDING', label: educatorsCopy.statusPending }]
                  : []),
                { value: 'ACTIVE', label: educatorsCopy.statusActive },
                { value: 'INACTIVE', label: educatorsCopy.statusInactive },
              ]}
              value={formik.values.status}
              onChange={(val) => formik.setFieldValue('status', val)}
              placeholder={educatorsCopy.placeholderSelectStatus}
              disabled={
                modalMode === 'edit' && formik.values.status === 'PENDING'
              }
            />
          )}
        </FormField>

        {(modalMode === 'create' || modalMode === 'edit') && (
          <FormField
            label={
              modalMode === 'edit'
                ? educatorsCopy.fieldAddSeats
                : educatorsCopy.fieldSeats
            }
            error={
              (formik.touched.tokens || formik.submitCount > 0) &&
              formik.errors.tokens
                ? (formik.errors.tokens as string)
                : undefined
            }
          >
            <div ref={tokenErrorRef}>
              <Input
                name="tokens"
                value={tokensInput}
                disabled={formik.values.status.toUpperCase() === 'INACTIVE'}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d+$/.test(raw)) {
                    return;
                  }
                  setTokensInput(raw);
                  formik.setFieldValue('tokens', raw === '' ? '' : Number(raw));
                }}
                onBlur={formik.handleBlur}
                placeholder={
                  modalMode === 'edit'
                    ? educatorsCopy.placeholderAddSeats
                    : educatorsCopy.placeholderEducatorSeats
                }
              />
            </div>
            {modalMode === 'edit' && adminAvailableSeats !== undefined && (
              <p className="mt-1 text-xs text-gray-500">
                {educatorsCopy.currentlyAvailableToAdd}{' '}
                <span className="font-semibold text-gray-700">
                  {adminAvailableSeats}
                </span>{' '}
                {educatorsCopy.seatsLabel}
              </p>
            )}
          </FormField>
        )}

        {modalMode === 'edit' && (
          <FormField
            label={educatorsCopy.removeSeats || 'Remove Seats'}
            error={
              removeSeatsInput &&
              removeSeatsInput.trim() !== '' &&
              tokensInput.trim() !== '' &&
              Number(tokensInput) > 0
                ? educatorsCopy.removeSeatsError ||
                  'Cannot add and remove seats at the same time'
                : removeSeatsInput &&
                    removeSeatsInput.trim() !== '' &&
                    Number(removeSeatsInput) >
                      (selectedEducator?.remainingTokens ?? 0)
                  ? (educatorsCopy.cannotExceedAvailableSeats ||
                      'Cannot exceed available seats') +
                    ` (${selectedEducator?.remainingTokens ?? 0})`
                  : undefined
            }
          >
            <Input
              name="removeSeats"
              value={removeSeatsInput ?? ''}
              disabled={formik.values.status.toUpperCase() === 'INACTIVE'}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw !== '' && !/^\d+$/.test(raw)) return;
                setRemoveSeatsInput?.(raw);
              }}
              placeholder={`${educatorsCopy.max} ${selectedEducator?.remainingTokens ?? 0}`}
            />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
