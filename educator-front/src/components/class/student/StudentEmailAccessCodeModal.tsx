import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '../../../components/common/Toast';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { translateApiError } from '../../../utils/translateApiError';
import {
  clearEmailAccessCodeState,
  selectEmailAccessCodeError,
  selectEmailAccessCodeLoading,
  selectEmailAccessCodeSuccess,
  sendEmailAccessCodeRequest,
} from '../../../redux/class/StudentEmailAccessRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { Button } from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Textarea from '../../ui/Textarea';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface Props {
  student: {
    id: string;
    student_id: string;
    student_name?: string | null;
    email?: string | null;
    class_id?: string;
  };
  onClose: () => void;
}

export default function StudentEmailAccessCodeModal({
  student,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const isLoading = useAppSelector(selectEmailAccessCodeLoading);
  const isSuccess = useAppSelector(selectEmailAccessCodeSuccess);
  const error = useAppSelector(selectEmailAccessCodeError);

  const [subject, setSubject] = useState('Student Access Code');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isSuccess) {
      dispatch(clearEmailAccessCodeState());
      onClose();
      setTimeout(() => toast.success(locale.toast.emailSentSuccessfully), 100);
    }
  }, [isSuccess, dispatch, onClose, locale.toast.emailSentSuccessfully]);

  useEffect(() => {
    if (error) toast.error(translateApiError(error, language));
  }, [error, language]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailAccessCodeState());
    };
  }, [dispatch]);

  const handleCopy = () => {
    navigator.clipboard.writeText(student.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    dispatch(
      sendEmailAccessCodeRequest({
        subject,
        message,
        accessCode: true,
        class_id: student.class_id!,
        student_id: student.id,
        email: student.email,
      })
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={locale.emailModal.titleStudentCode}>
      <div className="flex flex-col gap-4">
        <Input
          label={locale.emailModal.to}
          value={student.email ?? ''}
          disabled
          inputClassName="bg-gray-100 text-gray-500 cursor-not-allowed"
        />

        <Input
          label={locale.emailModal.subject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={locale.emailModal.subjectPlaceholderCode}
        />

        <Textarea
          label={locale.emailModal.message}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={locale.emailModal.messagePlaceholder}
          rows={4}
          textareaClassName="py-2.5"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {locale.emailModal.studentCode}
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-3 bg-orange-50 border border-orange-200 rounded-2xl text-center">
              <span className="text-orange-500 font-bold text-lg tracking-widest">
                {student.student_id}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="p-3 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors"
              title={locale.emailModal.copyStudentCode}
            >
              {copied ? (
                <Check size={18} className="text-green-500" />
              ) : (
                <Copy size={18} className="text-gray-500" />
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-2">
          <Button
            variant="secondary"
            className="w-1/2 h-11 rounded-full text-sm font-medium"
            onClick={onClose}
            disabled={isLoading}
          >
            {locale.emailModal.back}
          </Button>
          <Button
            variant="gradient"
            className="flex-1 h-11 rounded-full text-sm"
            onClick={handleSend}
            loading={isLoading}
            loadingText={locale.common.sending}
          >
            {locale.emailModal.sendViaEmail}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
