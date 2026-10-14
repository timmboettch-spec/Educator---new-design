import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { toast } from '../../../components/common/Toast';
import {
  DeleteStudentRequest,
  selectDeleteStudentLoading,
} from '../../../redux/class/Student/DeleteStudentRedux';
import { selectPutStudentLoading } from '../../../redux/class/Student/PatchStudentRedux';
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
const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
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

  const [studentCount, setStudentCount] = useState('');
  const [countError, setCountError] = useState<string | undefined>();

  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const studentLocale = ((locale as Record<string, unknown>).studentSubtable ??
    (locale as Record<string, unknown>).students ??
    {}) as Record<string, string>;

  useEffect(() => {
    setStudentCount('');
    setCountError(undefined);
    setShowDeleteConfirm(initialShowDelete ?? false);
  }, [editStudent, isOpen]);

  const validateCount = (): boolean => {
    const num = parseInt(studentCount, 10);
    if (!studentCount || isNaN(num) || num < 1) {
      setCountError(
        studentLocale.errMinStudents ??
          'Please enter a number of students (minimum 1)'
      );
      return false;
    }
    if (num > MAX_STUDENT_COUNT) {
      setCountError(
        studentLocale.errMaxStudents ??
          `Maximum ${MAX_STUDENT_COUNT} students can be added at once`
      );
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
        BulkPostStudentRequest({ class_id: classId, count })
      ).unwrap();
      const msg =
        language === 'es'
          ? `${count} ${studentLocale.toastAddSuccess ?? 'estudiante(s) agregado(s) con éxito'}`
          : result?.message?.trim() || `${count} student(s) added successfully`;
      toast.success(msg);
      onSuccess();
      handleClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(
        language === 'es'
          ? studentLocale.toastAddError || 'Error al agregar estudiantes'
          : (error?.message ??
              studentLocale.toastAddError ??
              'Failed to add students')
      );
    }
  };

  const handleDelete = async () => {
    try {
      const deleteResult = await dispatch(
        DeleteStudentRequest(editStudent!.id!)
      ).unwrap();
      toast.success(
        language === 'es'
          ? studentLocale.toastDeleteSuccess || 'Estudiante eliminado con éxito'
          : (deleteResult?.message ??
              studentLocale.toastDeleteSuccess ??
              'Student deleted successfully')
      );
      onSuccess();
      handleClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(
        language === 'es'
          ? studentLocale.toastDeleteError || 'Error al eliminar el estudiante'
          : (error?.message ??
              studentLocale.toastDeleteError ??
              'Failed to delete student')
      );
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
    const isEs = language === 'es';
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
              {studentLocale.back || (isEs ? 'Atrás' : 'Back')}
            </Button>

            <Button
              variant="gradient"
              className="flex-1 h-11 rounded-full text-sm"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading
                ? studentLocale.deleting ||
                  (isEs ? 'Eliminando...' : 'Deleting...')
                : studentLocale.modalDeleteTitle ||
                  (isEs ? 'Eliminar estudiante' : 'Delete Student')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-3">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>

          <h2 className="text-base font-semibold text-black mb-2">
            {studentLocale.modalDeleteTitle ||
              (isEs ? 'Eliminar estudiante' : 'Delete Student')}
          </h2>
          <p className="text-sm font-medium text-gray-700 mb-4">
            {editStudent?.student_name}
          </p>
          <p className="text-sm text-gray-500">
            {studentLocale.deleteConfirm ||
              (isEs
                ? '¿Estás seguro de que deseas eliminar este estudiante? Esta acción no se puede deshacer.'
                : 'Are you sure you want to delete this Student? This action cannot be undone.')}
            <br />
            {studentLocale.deleteRemoveReports ||
              (isEs
                ? 'Esto eliminará el acceso a todos los reportes'
                : 'This will remove access to all reports')}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        isEditMode
          ? (studentLocale.modalEditTitle ?? 'Edit Student')
          : (studentLocale.modalAddTitle ?? 'Add Student')
      }
      footer={
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="w-1/2 h-11 rounded-full text-sm font-medium"
            onClick={handleClose}
          >
            {studentLocale.back ?? 'Back'}
          </Button>
          {!isEditMode && (
            <Button
              type="submit"
              form="student-form"
              variant="gradient"
              className="flex-1 h-11 rounded-full text-sm"
              disabled={loading}
            >
              {loading
                ? (studentLocale.creating ?? 'Creating...')
                : (studentLocale.createStudent ?? 'Create Student')}
            </Button>
          )}
        </div>
      }
    >
      <form
        id="student-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        {isEditMode && (
          <Input
            label={studentLocale.fieldStudentCode ?? 'Student Code'}
            value={editStudent?.student_id ?? ''}
            disabled
            labelClassName="text-sm text-gray-600"
            inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500 cursor-not-allowed"
          />
        )}

        <Input
          label={studentLocale.fieldClass ?? 'Class'}
          value={className}
          disabled
          labelClassName="text-sm text-gray-600"
          inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500 cursor-not-allowed"
        />

        {!isEditMode && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {studentLocale.fieldNumberStudents ?? 'Number of Students'}
            </label>
            <Input
              type="text"
              placeholder={
                studentLocale.placeholderNumberStudents ??
                'Enter number of students'
              }
              value={studentCount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*$/.test(val)) {
                  setStudentCount(val);
                  setCountError(undefined);
                }
              }}
              onKeyDown={(e) => {
                if (['-', '+', 'e', 'E', '.'].includes(e.key))
                  e.preventDefault();
              }}
              error={countError}
              labelClassName="text-sm text-gray-600"
              inputClassName="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-orange-400 appearance-none"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
