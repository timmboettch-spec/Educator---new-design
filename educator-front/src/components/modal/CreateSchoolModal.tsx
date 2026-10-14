import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import { Button } from '../ui/Button';
import SelectField from '../ui/Select';
import {
  SCHOOL_NAME_MAX_LENGTH,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
} from '../../utils/inputSecurity';
import { AlertCircle } from 'lucide-react';
import type { School } from '../../redux/schools/GetSchoolsRedux';
import type { SchoolFormValues } from '../../types';
import type { FormikProps } from 'formik';
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

type CreateSchoolModalProps = {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  modalMode: 'create' | 'view' | 'edit' | 'delete';
  selectedSchool: School | null;
  isDeleting: boolean;
  isSubmitting: boolean;
  confirmDelete: () => void;
  formik: FormikProps<SchoolFormValues>;
};

export default function CreateSchoolModal({
  isModalOpen,
  setIsModalOpen,
  modalMode,
  selectedSchool,
  isSubmitting,
  formik,
  confirmDelete,
  isDeleting,
}: CreateSchoolModalProps) {
  if (!isModalOpen) return null;

  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const schoolsCopy = {
    modalCreateTitle: locale?.schools?.modalCreateTitle ?? 'Create School',
    modalEditTitle: locale?.schools?.modalEditTitle ?? 'Edit School',
    modalViewTitle: locale?.schools?.modalViewTitle ?? 'View School',
    modalDeleteTitle: locale?.schools?.modalDeleteTitle ?? 'Delete School',
    fieldSchoolName: locale?.schools?.fieldSchoolName ?? 'School Name',
    fieldStatus: locale?.schools?.fieldStatus ?? 'Status',
    fieldGoogleClassroom:
      locale?.schools?.fieldGoogleClassroom ?? 'Google Classroom Access',
    fieldGoogleClassroomHint:
      locale?.schools?.fieldGoogleClassroomHint ??
      'Allow educators at this school to open and use Google Classroom.',
    placeholderSchoolName:
      locale?.schools?.placeholderSchoolName ?? 'Enter School Name',
    statusActive: locale?.schools?.statusActive ?? 'Active',
    statusInactive: locale?.schools?.statusInactive ?? 'Inactive',
    back: locale?.schools?.back ?? 'Back',
    addSchool: locale?.schools?.addSchool ?? 'Add School',
    updateSchool: locale?.schools?.updateSchool ?? 'Update School',
    deleteSchool: locale?.schools?.deleteSchool ?? 'Delete School',
    deleteConfirm:
      locale?.schools?.deleteConfirm ??
      'Are you sure you want to delete this School? This action cannot be undone.',
    saving: locale?.schools?.saving ?? 'Saving...',
    deleting: locale?.schools?.deleting ?? 'Deleting...',
  };

  if (modalMode === 'delete') {
    return (
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title=""
      >
        <div className="flex flex-col items-center text-center px-6 py-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">
            {schoolsCopy.modalDeleteTitle}
          </h2>
          <p className="text-sm font-medium text-gray-700 mb-1">
            {selectedSchool?.school_name}
          </p>
          <p className="text-sm text-gray-500 mb-6 max-w-sm">
            {schoolsCopy.deleteConfirm}
          </p>
          <div className="flex gap-4 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              className="w-1/2 h-11 rounded-full text-sm font-medium"
            >
              {schoolsCopy.back}
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              loading={isDeleting}
              loadingText={schoolsCopy.deleting}
              className="w-1/2 h-11 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
            >
              {schoolsCopy.deleteSchool}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      contentClassName="overflow-visible"
      title={
        modalMode === 'create'
          ? schoolsCopy.modalCreateTitle
          : modalMode === 'edit'
            ? schoolsCopy.modalEditTitle
            : schoolsCopy.modalViewTitle
      }
      footer={
        <div
          className={`flex gap-4 ${modalMode === 'view' ? 'flex-col' : 'flex-row'}`}
        >
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsModalOpen(false)}
            className={`h-11 rounded-full text-sm font-medium ${modalMode === 'view' ? 'w-full' : 'w-1/2'}`}
          >
            {schoolsCopy.back}
          </Button>
          {modalMode !== 'view' && (
            <Button
              type="submit"
              form="school-form"
              loading={isSubmitting}
              loadingText={schoolsCopy.saving}
              className="w-1/2 h-11 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
            >
              {modalMode === 'create'
                ? schoolsCopy.addSchool
                : schoolsCopy.updateSchool}
            </Button>
          )}
        </div>
      }
    >
      <form
        id="school-form"
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
        <FormField
          label={schoolsCopy.fieldSchoolName}
          required
          error={
            formik.touched.school_name || formik.values.school_name.length > 50
              ? formik.errors.school_name
              : undefined
          }
        >
          <Input
            name="school_name"
            value={formik.values.school_name}
            onChange={(e) => {
              const sanitized = sanitizeTextForTyping(
                e.target.value,
                SCHOOL_NAME_MAX_LENGTH
              );
              formik.setFieldValue('school_name', sanitized);
            }}
            onBlur={(e) => {
              const trimmed = trimBoundaryWhitespace(e.target.value);
              if (trimmed !== formik.values.school_name) {
                formik.setFieldValue('school_name', trimmed, false);
              }
              formik.handleBlur(e);
            }}
            disabled={modalMode === 'view'}
            placeholder={schoolsCopy.placeholderSchoolName}
            className={`h-11 rounded-xl w-full${modalMode === 'view' ? 'text-gray-500' : 'bg-white '}`}
          />
        </FormField>

        <FormField
          label={schoolsCopy.fieldStatus}
          required={modalMode !== 'view'}
          error={formik.touched.status ? formik.errors.status : undefined}
        >
          {modalMode === 'view' ? (
            <Input
              value={
                formik.values.status?.toUpperCase() === 'ACTIVE'
                  ? schoolsCopy.statusActive
                  : schoolsCopy.statusInactive
              }
              disabled
              className="h-11 rounded-xl w-full text-gray-500 cursor-not-allowed"
            />
          ) : (
            <SelectField
              options={[
                { value: 'ACTIVE', label: schoolsCopy.statusActive },
                { value: 'INACTIVE', label: schoolsCopy.statusInactive },
              ]}
              value={formik.values.status}
              onChange={(val) => formik.setFieldValue('status', val)}
              placeholder={schoolsCopy.statusActive}
            />
          )}
        </FormField>

        <FormField label={schoolsCopy.fieldGoogleClassroom}>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#ED621F]"
              checked={Boolean(formik.values.google_classroom_enabled)}
              disabled={modalMode === 'view'}
              onChange={(e) =>
                formik.setFieldValue(
                  'google_classroom_enabled',
                  e.target.checked
                )
              }
            />
            <span className="text-sm text-[#344054]">
              {formik.values.google_classroom_enabled
                ? schoolsCopy.statusActive
                : schoolsCopy.statusInactive}
            </span>
          </label>
          <p className="text-xs text-gray-500">
            {schoolsCopy.fieldGoogleClassroomHint}
          </p>
        </FormField>
      </form>
    </Modal>
  );
}
