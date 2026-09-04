import { useState, useEffect } from 'react';
import { toast } from '../common/Toast';
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

interface Props {
  class_id: string;
  students?: Student[];
  onClose: () => void;
}

export default function BulkEmailAccessCodeModal({ class_id, students = [], onClose }: Props) {
  const dispatch = useAppDispatch();
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
      toast.error('No student email addresses available.');
      return;
    }
    try {
      const result = await dispatch(
        sendEmailAccessCodeRequest({ subject, message, accessCode: true, class_id }),
      ).unwrap();
      const sentCount = result.count ?? students.length - missingEmailCount;
      toast.success(
        `Email sent successfully to ${sentCount} ${sentCount === 1 ? 'student' : 'students'}.`,
      );
      dispatch(clearEmailAccessCodeState());
      onClose();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error?.message ?? 'Failed to send student codes');
    }
  };

  return (
    <>
      {!showConfirm && (
        <Modal isOpen onClose={onClose} title="Email student Code">
          <div className="flex flex-col gap-4">
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Student Code"
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                Message <span className="text-red-500">*</span>
              </label>

              <Textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (e.target.value.trim()) setMessageError('');
                }}
                placeholder="Add a message..."
                rows={4}
                textareaClassName="py-2.5"
              />

              {messageError && <p className="text-red-500 text-xs mt-1">{messageError}</p>}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-primary-50 border border-primary-200 rounded-2xl">
              <svg
                className="w-4 h-4 text-primary-400 shrink-0"
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
              <p className="text-xs text-primary-500">
                Each student will receive their own unique student code via email.
              </p>
            </div>

            <div className="flex gap-3 mt-2">
              <Button
                variant="secondary"
                className="w-1/2 h-11 rounded-full text-sm font-medium"
                onClick={onClose}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                variant="gradient"
                className="flex-1 h-11 rounded-full text-sm"
                onClick={handleSend}
                disabled={isLoading}
              >
                Send Via Email
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showConfirm && (
        <Modal
          isOpen
          onClose={onClose}
          title="Send Email Student Codes"
          subtitle="Review student availability and confirm before distribution"
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
                  Action Required: {missingEmailCount} students do not have an email address.
                  Reports cannot be sent to them.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-[15px] w-[100%] mx-auto">
              <div className="bg-[#F4F4F4] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#8B7E74]">
                  TOTAL
                </span>
                <span className="text-[22px] leading-none font-bold text-[#F7931E] mt-[4px]">
                  {students.length}
                </span>
              </div>

              <div className="bg-[#F4F4F4] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#8B7E74]">
                  AVAILABLE
                </span>
                <span className="text-[22px] leading-none font-bold text-[#F7931E] mt-[4px]">
                  {students.length - missingEmailCount}
                </span>
              </div>

              <div className="border border-[#F5C58A] bg-[#fdf3e8] rounded-[16px] py-[20px] flex flex-col items-center justify-center">
                <span className="text-[12px] tracking-[1.5px] font-semibold text-[#F7931E]">
                  MISSING
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
                Cancel
              </Button>

              <Button
                variant="gradient"
                className="flex-1 h-11 rounded-full text-sm"
                onClick={executeSend}
                loading={isLoading}
                loadingText="Sending..."
                disabled={isLoading}
              >
                <div className="flex items-center justify-center gap-[10px]">
                  <span>
                    {students.length - missingEmailCount > 0
                      ? `Send to ${students.length - missingEmailCount} Students`
                      : 'Send Via Email'}
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
