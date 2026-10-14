import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../modal/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { getParsedUser } from '../../utils/storage';

import type { ClassFormValues } from '../../types/Class_types';
import type { Class, ModalMode } from '../../types/Class_types';
import type { EducatorSchool } from './ClassFormFields';
import { CreateClassModal } from './CreateClassModal';
import { EditClassModal } from './EditClassModal';

interface ClassFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalMode: ModalMode;
  selectedClass: Class | null;
  isDeleting: boolean;
  onConfirmDelete: () => void;
  onSubmit: (values: ClassFormValues) => Promise<void>;
}

export default function ClassFormModal({
  isOpen,
  onClose,
  modalMode,
  selectedClass,
  isDeleting,
  onConfirmDelete,
  onSubmit,
}: ClassFormModalProps) {
  const { t } = useTranslation('classManagement');

  const parsedUser = getParsedUser();
  const educatorSchools: EducatorSchool[] =
    ((parsedUser as Record<string, unknown> | null)?.schools as
      EducatorSchool[] | undefined) ?? [];
  const [assignCount, setAssignCount] = useState('');

  if (modalMode === 'create') {
    return (
      <CreateClassModal
        isOpen={isOpen}
        onClose={onClose}
        educatorSchools={educatorSchools}
        onSubmit={onSubmit}
      />
    );
  }

  if (modalMode === 'edit') {
    return (
      <EditClassModal
        isOpen={isOpen}
        onClose={onClose}
        selectedClass={selectedClass}
        educatorSchools={educatorSchools}
        onSubmit={onSubmit}
      />
    );
  }

  if (modalMode === 'delete') {
    return (
      <ConfirmDialog
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={onConfirmDelete}
        title={t('form.deleteTitle')}
        itemName={selectedClass?.class_name}
        message={t('form.deleteConfirm')}
        confirmText={t('form.deleteAction')}
        cancelText={t('form.back')}
        isLoading={isDeleting}
        loadingText={t('form.deleting')}
      />
    );
  }

  if (modalMode === 'assign') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('form.fieldStudents')}
        footer={
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full"
          >
            {t('form.back')}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {['class_name'].map((field) => (
            <FormField
              key={field}
              label={field
                .replace('_', ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())}
              required={field === 'class_name'}
            >
              <Input
                name={field}
                value={
                  (selectedClass?.[field as keyof typeof selectedClass] as
                    string | number) || ''
                }
                readOnly
                className="bg-gray-100"
              />
            </FormField>
          ))}
          <FormField label={t('form.totalNumberOfStudents')}>
            <Input
              name="assign_count"
              type="number"
              placeholder={t('form.placeholderStudentCount')}
              value={assignCount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAssignCount(e.target.value)
              }
            />
          </FormField>
        </div>
      </Modal>
    );
  }

  return null;
}
