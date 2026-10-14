import { useEffect, useState } from 'react';
import { toast } from '../../components/common/Toast';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { translateApiError } from '../../utils/translateApiError';
import {
  clearEmailReportState,
  selectEmailReportError,
  selectEmailReportLoading,
  selectEmailReportSuccess,
  sendEmailReportRequest,
} from '../../redux/class/StudentEmailReportRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { Button } from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface Props {
  classId: string;
  onClose: () => void;
}

export default function ClassEmailReportModal({ classId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const isLoading = useAppSelector(selectEmailReportLoading);
  const error = useAppSelector(selectEmailReportError);
  const isSuccess = useAppSelector(selectEmailReportSuccess);
  const [subject, setSubject] = useState('Student Progress Report');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | undefined>();
  const [includePdf, setIncludePdf] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(translateApiError(error, language));
    }
  }, [error, language]);

  useEffect(() => {
    if (isSuccess) {
      toast.success(locale.toast.reportSentToAllStudents);
      dispatch(clearEmailReportState());
      onClose();
    }
  }, [isSuccess, dispatch, onClose, locale.toast.reportSentToAllStudents]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailReportState());
    };
  }, [dispatch]);

  const handleSend = () => {
    if (!message.trim()) {
      setMessageError(locale.emailModal.messageRequired);
      return;
    }
    setMessageError(undefined);
    dispatch(
      sendEmailReportRequest({
        subject,
        message,
        sendPdf: includePdf,
        class_id: classId,
      })
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={locale.emailModal.titleReport}>
      <div className="flex flex-col gap-4">
        <Input
          label={locale.emailModal.subject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={locale.emailModal.subjectPlaceholderReport}
        />

        <Textarea
          label={locale.emailModal.message}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (e.target.value.trim()) setMessageError(undefined);
          }}
          placeholder={locale.emailModal.messagePlaceholder}
          rows={5}
          textareaClassName="py-2.5"
          error={messageError}
        />

        <div className="flex items-center gap-2.5 pt-1">
          <Input
            id="includePdfClass"
            type="checkbox"
            checked={includePdf}
            onChange={(e) => setIncludePdf(e.target.checked)}
            className="h-4 w-4 accent-orange-500 cursor-pointer rounded"
          />
          <label
            htmlFor="includePdfClass"
            className="text-sm leading-none text-gray-700 cursor-pointer select-none"
          >
            {locale.emailModal.includePdfReport}
          </label>
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
            {locale.emailModal.sendMail}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
