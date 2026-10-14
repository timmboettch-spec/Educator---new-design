import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { toast } from '../../common/Toast';
import { FormModal } from '../../modal/FormModal';
import { getApiErrorMessage } from '../../../redux/api/classes/classesService';
import { useDateRangeFields } from '../../../hooks/useDateRangeFields';
import { useUpdateClassSimulationMutation } from '../../../redux/api/classSimulations/classSimulationsApi';
import {
  getEditSimulationSchema,
  type EditSimulationFormValues,
} from '../../../schemas/editSimulation.schema';
import type { SimulationItem } from '../../../types/index';
import { DatePickerField } from '../../ui/DatePickerField';
import Input from '../../ui/Input';
import { getDerivedCategory } from '../../../utils/simulationType';

interface EditSimulationModalProps {
  sim: SimulationItem;
  onClose: () => void;
}

const DATE_FIELD_NAMES = ['startDate', 'dueDate', 'closeDate'] as const;

const toInputDate = (date: string): string => {
  if (!date) return '';
  const parts = date.split('-');
  if (parts.length !== 3) return '';
  if (parts[0]?.length === 4) return date;
  return `${parts[2]}-${parts[0]}-${parts[1]}`;
};

/** Edits an assignment's start, due and close dates. */
export function EditSimulationModal({
  sim,
  onClose,
}: EditSimulationModalProps) {
  const { t } = useTranslation('classManagement');
  const [updateClassSimulation] = useUpdateClassSimulationMutation();
  const [apiError, setApiError] = useState<string | null>(null);

  const initialValues: EditSimulationFormValues = {
    startDate: toInputDate(sim.start_date),
    dueDate: toInputDate(sim.due_date),
    closeDate: toInputDate(sim.end_date),
  };
  const originalStart = initialValues.startDate;
  const originalClose = initialValues.closeDate;

  const formik = useFormik<EditSimulationFormValues>({
    enableReinitialize: true,
    initialValues,
    validationSchema: getEditSimulationSchema({
      t,
      originalStart,
      originalClose,
    }),
    onSubmit: async (values) => {
      const hasChanges = DATE_FIELD_NAMES.some(
        (name) => values[name] !== initialValues[name]
      );
      if (!hasChanges) {
        toast.error(t('editSimModal.noChanges'));
        return;
      }
      setApiError(null);
      try {
        await updateClassSimulation({
          id: sim.id,
          body: {
            startDate: values.startDate,
            dueDate: values.dueDate,
            endDate: values.closeDate,
          },
        }).unwrap();
        toast.success(t('editSimModal.successUpdate'));
        onClose();
      } catch (error) {
        setApiError(
          getApiErrorMessage(error, t('editSimModal.errUpdateFailed'))
        );
      }
    },
  });

  const { values, isSubmitting } = formik;

  const handleClose = () => {
    formik.resetForm();
    setApiError(null);
    onClose();
  };

  const { dateFieldProps } = useDateRangeFields(formik, DATE_FIELD_NAMES);

  return (
    <FormModal
      isOpen
      onClose={handleClose}
      title={t('editSimModal.title')}
      formId="edit-simulation-form"
      onSubmit={formik.handleSubmit}
      submitText={t('editSimModal.saveChanges')}
      submittingText={t('editSimModal.saving')}
      cancelText={t('editSimModal.back')}
      isSubmitting={isSubmitting}
      submitTone="primary"
    >
      {apiError && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{apiError}</p>
        </div>
      )}

      <Input
        label={t('editSimModal.fieldSimName')}
        value={sim.simulation_title}
        readOnly
        inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
      />

      <Input
        label={t('editSimModal.fieldUnit')}
        value={sim.unit_name ?? sim.unit ?? sim.simulation_lib_name ?? ''}
        readOnly
        inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
      />

      <Input
        label={t('editSimModal.fieldProductCategory')}
        value={getDerivedCategory(sim.avatarEnabled) || ''}
        readOnly
        inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
      />

      <div className="grid grid-cols-3 gap-3">
        <DatePickerField
          {...dateFieldProps('startDate')}
          label={t('editSimModal.fieldStartDate')}
          min={originalStart}
          max={originalClose}
          disabled={isSubmitting}
        />
        <DatePickerField
          {...dateFieldProps('dueDate')}
          label={t('editSimModal.fieldDueDate')}
          min={values.startDate || originalStart}
          max={values.closeDate || originalClose}
          disabled={isSubmitting}
        />
        <DatePickerField
          {...dateFieldProps('closeDate')}
          label={t('editSimModal.fieldCloseDate')}
          min={values.dueDate || values.startDate || originalStart}
          max={originalClose}
          disabled={isSubmitting}
        />
      </div>
    </FormModal>
  );
}
