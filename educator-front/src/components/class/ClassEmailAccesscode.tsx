import { useState, useEffect } from 'react';
import { toast } from '../common/Toast';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { translateApiError } from '../../utils/translateApiError';
import {
  clearEmailAccessCodeState,
  selectEmailAccessCodeLoading,
  sendEmailAccessCodeRequest,
} from '../../redux/class/StudentEmailAccessRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { Button } from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import type { Student } from '../../types';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface Props {
  class_id: string;
  students?: Student[];
  onClose: () => void;
}

export default function BulkEmailAccessCodeModal({
  class_id,
  students = [],
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const isLoading = useAppSelector(selectEmailAccessCodeLoading);

  const [subject, setSubject] = useState('Student Access Code');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const missingEmailCount = students.filter((s) => !s.email?.trim()).length;

  useEffect(() => {
    return () => {
      dispatch(clearEmailAccessCodeState());
    };
  }, [dispatch]);

  const handleSend = () => {
    if (!message.trim()) {
      setMessageError('Message is required');
      return;
    }
    setMessageError('');
    setShowConfirm(true);
  };

  const executeSend = async () => {
    const availableStudents = students.filter((s) => s.email?.trim());

    if (availableStudents.length === 0) {
      toast.error(locale.toast.noStudentEmailsAvailable);
      return;
    }
    try {
      const result = await dispatch(
        sendEmailAccessCodeRequest({
          subject,
          message,
          accessCode: true,
          class_id,
        })
      ).unwrap();
      const sentCount = result.count ?? students.length - missingEmailCount;
      const successTemplate =
        sentCount === 1
          ? (locale.toast.emailSentToCountSingular ??
            'Email sent successfully to {count} student.')
          : (locale.toast.emailSentToCountPlural ??
            'Email sent successfully to {count} students.');
      toast.success(successTemplate.replace('{count}', String(sentCount)));
      dispatch(clearEmailAccessCodeState());
      onClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(
        error?.message
          ? translateApiError(error.message, language)
          : locale.toast.failedToSendEmail
      );
    }
  };

  return (
    <>
      {!showConfirm && (
        <Modal
          isOpen
          onClose={onClose}
          title={locale.bulkAccessCodeModal.title}
        >
          <div className="flex flex-col gap-4">
            <Input
              label={locale.emailModal.subject}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={locale.emailModal.subjectPlaceholderCode}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                {locale.emailModal.message}{' '}
                <span className="text-red-500">*</span>
              </label>

              <Textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (e.target.value.trim()) setMessageError('');
                }}
                placeholder={locale.emailModal.messagePlaceholder}
                rows={4}
                textareaClassName="py-2.5"
              />

              {messageError && (
                <p className="text-red-500 text-xs mt-1">{messageError}</p>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-2xl">
              <svg
                className="w-4 h-4 text-orange-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"
                />
              </svg>
              <p className="text-xs text-orange-500">
                {locale.bulkAccessCodeModal.helperText}
              </p>
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
                disabled={isLoading}
              >
                {locale.emailModal.sendViaEmail}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showConfirm && (
        <Modal
          isOpen
          onClose={onClose}
          title={locale.bulkAccessCodeModal.confirmTitle}
          subtitle={locale.bulkAccessCodeModal.confirmSubtitle}
        >
          <div className="flex flex-col gap-[36px]">
            {missingEmailCount > 0 && (
              <div className="flex items-start gap-[12px] bg-[#F8F5F2] border-l-[4px] border-[#F7931E] rounded-[20px] px-[20px] py-[12px]">
                <svg
                  className="w-[16px] h-[16px] text-[#F7931E] shrink-0 mt-[6px]"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.591c.75 1.334-.213 2.99-1.742 2.99H3.48c-1.53 0-2.492-1.656-1.743-2.99L8.257 3.1zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-[13px] leading-[24px] font-medium text-[#374151]">
                  {locale.bulkAccessCodeModal.actionRequired.replace(
                    '{count}',
                    String(missingEmailCount)
                  )}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-[15px] w-[100%] mx-auto">
              <div className="bg-[#F4F4F4] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#8B7E74]">
                  {locale.bulkAccessCodeModal.total}
                </span>
                <span className="text-[22px] leading-none font-bold text-[#F7931E] mt-[4px]">
                  {students.length}
                </span>
              </div>

              <div className="bg-[#F4F4F4] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#8B7E74]">
                  {locale.bulkAccessCodeModal.available}
                </span>
                <span className="text-[22px] leading-none font-bold text-[#F7931E] mt-[4px]">
                  {students.length - missingEmailCount}
                </span>
              </div>

              <div className="border border-[#F5C58A] bg-[#fdf3e8] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#F7931E]">
                  {locale.bulkAccessCodeModal.missing}
                </span>
                <span className="text-[22px] leading-none font-bold text-[#F7931E] mt-[4px]">
                  {missingEmailCount}
                </span>
              </div>
            </div>

            <div className="flex gap-[16px] pt-[4px]">
              <Button
                variant="secondary"
                className="w-1/2 h-11 rounded-full text-sm font-medium"
                onClick={() => setShowConfirm(false)}
              >
                {locale.bulkAccessCodeModal.cancel}
              </Button>

              <Button
                variant="gradient"
                className="flex-1 h-11 rounded-full text-sm"
                onClick={executeSend}
                loading={isLoading}
                loadingText={locale.common.sending}
                disabled={isLoading}
              >
                <div className="flex items-center justify-center gap-[10px]">
                  <span>
                    {students.length - missingEmailCount > 0
                      ? locale.bulkAccessCodeModal.sendToCount.replace(
                          '{count}',
                          String(students.length - missingEmailCount)
                        )
                      : locale.emailModal.sendViaEmail}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-white rotate-[+43deg]"
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </div>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
