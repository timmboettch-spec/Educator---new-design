import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import {
  EDUCATOR_BUTTONS,
  EDUCATOR_FIELDS,
  EDUCATOR_MODALS,
  EDUCATOR_PLACEHOLDERS,
} from '../../utils/messages/educator';
import type { FormikProps } from 'formik';
import { Button } from '../ui/Button';

type EducatorModalProps = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  modalMode: 'create' | 'view' | 'edit';
  schools: { id: string; school_name: string }[];
  openSchoolDropdown: boolean;
  setOpenSchoolDropdown: (open: boolean) => void;
  isSubmitting: boolean;
  formik: FormikProps<{
    full_name: string;
    email: string;
    phone_number: string;
    status: string;
    tokens: number;
    school_id: string;
  }>;
};

export default function EducatorModal({
  isOpen,
  setOpen,
  modalMode,
  schools,
  openSchoolDropdown,
  setOpenSchoolDropdown,
  isSubmitting,
  formik,
}: EducatorModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setOpen(false)}
      title={
        modalMode === 'create'
          ? EDUCATOR_MODALS.ADD
          : modalMode === 'edit'
            ? EDUCATOR_MODALS.EDIT
            : EDUCATOR_MODALS.VIEW
      }
    >
      <form onSubmit={formik.handleSubmit} className="flex flex-col gap-5">
        <FormField
          label={EDUCATOR_FIELDS.EDUCATOR_NAME}
          required
          error={
            formik.touched.full_name
              ? (formik.errors.full_name as string)
              : undefined
          }
        >
          <Input
            name="full_name"
            value={formik.values.full_name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={modalMode === 'view'}
            placeholder={EDUCATOR_PLACEHOLDERS.ENTER_NAME}
            className="h-11 rounded-xl bg-transparent border border-gray-200"
            inputClassName={
              modalMode === 'view' ? 'text-gray-400 cursor-not-allowed' : ''
            }
          />
        </FormField>

        <FormField
          label="Tokens"
          required
          error={
            formik.touched.tokens ? (formik.errors.tokens as string) : undefined
          }
        >
          <Input
            name="tokens"
            type="tokens"
            value={formik.values.tokens}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled={modalMode === 'view'}
            placeholder="Enter Educator Tokens"
            className="h-11 rounded-xl bg-transparent border border-gray-200"
            inputClassName={
              modalMode === 'view' ? 'text-gray-400 cursor-not-allowed' : ''
            }
          />
        </FormField>

        <FormField
          label="Educator Email"
          required
          error={
            formik.touched.email ? (formik.errors.email as string) : undefined
          }
        >
          <Input
            name="email"
            type="email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            disabled
            placeholder="Enter Educator Email"
            className="h-11 rounded-xl bg-transparent border border-gray-200"
            inputClassName={
              modalMode === 'view'
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-400 cursor-not-allowed'
            }
          />
        </FormField>

        <FormField
          label={EDUCATOR_FIELDS.SCHOOL}
          required
          error={
            formik.touched.school_id
              ? (formik.errors.school_id as string)
              : undefined
          }
        >
          <div className="relative">
            <div
              onClick={() =>
                modalMode !== 'view' &&
                setOpenSchoolDropdown(!openSchoolDropdown)
              }
              className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm w-full flex items-center justify-between cursor-pointer"
            >
              <span
                className={
                  modalMode === 'view' ? 'text-gray-400' : 'text-gray-700'
                }
              >
                {schools?.find((s) => s.id === formik.values.school_id)
                  ?.school_name || EDUCATOR_PLACEHOLDERS.SELECT_SCHOOL}
              </span>
            </div>
            {openSchoolDropdown && (
              <div className="absolute mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                {schools?.map((school) => (
                  <div
                    key={school.id}
                    onClick={() => {
                      formik.setFieldValue('school_id', school.id);
                      setOpenSchoolDropdown(false);
                    }}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  >
                    {school.school_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        <FormField label={EDUCATOR_FIELDS.EDUCATOR_STATUS}>
          <select
            name="status"
            value={formik.values.status}
            onChange={formik.handleChange}
            disabled={modalMode === 'view'}
            className={`h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm w-full ${
              modalMode === 'view'
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-700'
            }`}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </FormField>

        <div className="flex gap-4 mt-6">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            Back
          </Button>
          {modalMode !== 'view' && (
            <Button
              type="submit"
              loading={isSubmitting}
              className="w-1/2 h-11 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
            >
              {modalMode === 'create'
                ? EDUCATOR_BUTTONS.INVITE
                : EDUCATOR_BUTTONS.UPDATE}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
