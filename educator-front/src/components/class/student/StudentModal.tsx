import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '../../../components/common/Toast';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  DeleteStudentRequest,
  selectDeleteStudentLoading,
} from '../../../redux/class/Student/DeleteStudentRedux';
import {
  selectPutStudentLoading,
} from '../../../redux/class/Student/PatchStudentRedux';
import {
  BulkPostStudentRequest,
  selectBulkPostStudentLoading,
} from '../../../redux/class/Student/BulkPostStudentRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import type { Student } from '../../../types';
import { Button } from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';

const MAX_STUDENT_COUNT = 50;

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  onSuccess: () => void;
  editStudent?: Student | null;
  initialShowDelete?: boolean;
  existingCodes?: Set<string>;
}

export default function StudentModal({
  isOpen,
  onClose,
  classId,
  className,
  onSuccess,
  editStudent,
  initialShowDelete,
}: Props) {
  const dispatch = useAppDispatch();
  const bulkLoading = useAppSelector(selectBulkPostStudentLoading);
  const putLoading = useAppSelector(selectPutStudentLoading);
  const deleteLoading = useAppSelector(selectDeleteStudentLoading);
  const isEditMode = !!editStudent;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const lang = getStoredLanguage();
  const locale = lang === 'es' ? loginEs : loginEn;
  const m = locale.studentModals;

  const [studentCount, setStudentCount] = useState('');
  const [countError, setCountError] = useState<string | undefined>();

  useEffect(() => {
    setStudentCount('');
    setCountError(undefined);
    setShowDeleteConfirm(initialShowDelete ?? false);
  }, [editStudent, isOpen]);

  const validateCount = (): boolean => {
    const num = parseInt(studentCount, 10);
    if (!studentCount || isNaN(num) || num < 1) {
      setCountError(lang === 'es' ? 'Ingresa una cantidad de estudiantes (mínimo 1)' : 'Please enter a number of students (minimum 1)');
      return false;
    }
    if (num > MAX_STUDENT_COUNT) {
      setCountError(lang === 'es' ? `Máximo ${MAX_STUDENT_COUNT} estudiantes a la vez` : `Maximum ${MAX_STUDENT_COUNT} students can be added at once`);
      return false;
    }
    setCountError(undefined);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateCount()) return;
    try {
      const count = parseInt(studentCount, 10);
      const result = await dispatch(
        BulkPostStudentRequest({ class_id: classId, count }),
      ).unwrap();
      const msg = result?.message?.trim() || (lang === 'es' ? `${count} estudiante(s) agregado(s) con éxito` : `${count} student(s) added successfully`);
      toast.success(msg);
      onSuccess();
      handleClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error?.message ?? (lang === 'es' ? 'Error al agregar estudiantes' : 'Failed to add students'));
    }
  };

  const handleDelete = async () => {
    try {
      const deleteResult = await dispatch(DeleteStudentRequest(editStudent!.id!)).unwrap();
      toast.success(deleteResult?.message ?? (lang === 'es' ? 'Estudiante eliminado con éxito' : 'Student deleted successfully'));
      onSuccess();
      handleClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error?.message ?? (lang === 'es' ? 'Error al eliminar el estudiante' : 'Failed to delete student'));
    }
  };

  const handleClose = () => {
    setStudentCount('');
    setCountError(undefined);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!isOpen) return null;

  const loading = bulkLoading || putLoading;

  if (showDeleteConfirm) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title=""
        footer={
          <div className="flex gap-3 w-full">
            <Button
              variant="secondary"
              className="w-1/2 h-11 rounded-full text-sm font-medium"
              onClick={() => handleClose()}
            >
              {m.back}
            </Button>

            <Button
              variant="gradient"
              className="flex-1 h-11 rounded-full text-sm"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? m.deleting : m.deleteStudent}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-3">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>

          <h2 className="text-base font-semibold text-black mb-2">{m.deleteStudent}</h2>
          <p className="text-sm font-medium text-gray-700 mb-4">{editStudent?.student_name}</p>
          <p className="text-sm text-gray-500">
            {m.deleteStudentConfirm}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? m.editStudent : m.addStudent}
      footer={
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="w-1/2 h-11 rounded-full text-sm font-medium"
            onClick={handleClose}
          >
            {m.back}
          </Button>
          {!isEditMode && (
            <Button
              type="submit"
              form="student-form"
              variant="gradient"
              className="flex-1 h-11 rounded-full text-sm"
              disabled={loading}
            >
              {loading ? m.creating : m.createStudent}
            </Button>
          )}
        </div>
      }
    >
      <form
        id="student-form"
        onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
        className="flex flex-col gap-4"
      >
        {isEditMode && (
          <Input
            label={m.studentCode}
            value={editStudent?.student_id ?? ''}
            disabled
            labelClassName="text-sm text-gray-600"
            inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500 cursor-not-allowed"
          />
        )}

        <Input
          label={m.class}
          value={className}
          disabled
          labelClassName="text-sm text-gray-600"
          inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500 cursor-not-allowed"
        />

        {!isEditMode && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="student-count"
              className="text-sm font-medium text-gray-700"
            >
              {m.numberOfStudents}
            </label>
            <Input
              id="student-count"
              type="text"
              placeholder={m.enterNumberOfStudents}
              value={studentCount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*$/.test(val)) {
                  setStudentCount(val);
                  setCountError(undefined);
                }
              }}
              onKeyDown={(e) => {
                if (['-', '+', 'e', 'E', '.'].includes(e.key)) e.preventDefault();
              }}
              error={countError}
              labelClassName="text-sm text-gray-600"
              inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary-400 appearance-none"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
