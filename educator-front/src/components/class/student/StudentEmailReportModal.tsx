import { useEffect, useState } from 'react';
import { toast } from '../../../components/common/Toast';
import {
  clearEmailReportState,
  selectEmailReportError,
  selectEmailReportLoading,
  selectEmailReportSuccess,
  sendEmailReportRequest,
} from '../../../redux/class/StudentEmailReportRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { Button } from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Textarea from '../../ui/Textarea';

interface Props {
  student: {
    student_id: string;
    student_name?: string | null;
    email?: string | null;
    class_id?: string;
    last_sent_date?: string | null;
    // Report stats — passed from page so email shows real data
    score?: number | null;
    attempt?: number | null;
    time_spent?: string | null;
    sims_completed?: string | null;
    scenario_title?: string | null;
  };
  report_id?: string;
  report_key?: string;
 
  report_type?: 'assessment' | 'progress';
  pdfGeneratorFn?: () => string | null;
  onClose: () => void;
}

export default function StudentEmailReportModal({ student, report_id, report_key, report_type, pdfGeneratorFn, onClose }: Props) {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectEmailReportLoading);
  const isSuccess = useAppSelector(selectEmailReportSuccess);
  const error = useAppSelector(selectEmailReportError);

  const [subject, setSubject] = useState(
    report_type === 'assessment' ? 'Student Assessment Report' : 'Student Progress Report',
  );
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [includePdf, setIncludePdf] = useState(false);
  const successMessage = useAppSelector((state) => state.StudentEmailReport.message);

  useEffect(() => {
    if (isSuccess) {
      const msg = successMessage;
      dispatch(clearEmailReportState());
      onClose();
      setTimeout(() => toast.success(msg || 'Email sent successfully'), 100);
    }
  }, [isSuccess, successMessage]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailReportState());
    };
  }, [dispatch]);

  const handleSend = () => {
    if (!student.email?.trim()) {
      setEmailError('Email is required');
      toast.error('Student email is required');
      return;
    }
    setEmailError('');
    if (!message.trim()) {
      setMessageError('Message is required');
      return;
    }
    setMessageError('');

    const pdfBase64 = includePdf && pdfGeneratorFn ? pdfGeneratorFn() : undefined;
    if (includePdf && !pdfBase64) {
      toast.error('Unable to generate the PDF attachment. Please wait for the report to finish loading and try again.');
      return;
    }

    dispatch(
      sendEmailReportRequest({
        subject,
        message,
        sendPdf: !!pdfBase64,
        class_id: student.class_id,
        student_id: student.student_id,
        email: student.email,
        student_name: student.student_name,
        score: student.score,
        attempt: student.attempt,
        time_spent: student.time_spent,
        sims_completed: student.sims_completed,
        scenario_title: student.scenario_title,
        report_id,
        report_key,
        report_type,
        pdf_base64: pdfBase64 ?? undefined,
      }),
    );
  };

  return (
    <Modal isOpen onClose={onClose} title="Email Report">
      <div className="flex flex-col gap-4">
        <Input
          label="To"
          value={student.email ?? ''}
          disabled
          inputClassName="bg-gray-100 text-gray-500 cursor-not-allowed"
          error={emailError}
        />

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Student Progress Report"
        />

        <Textarea
          label="Message *"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (e.target.value.trim()) setMessageError('');
          }}
          placeholder="Add a message..."
          rows={5}
          textareaClassName={`py-2.5 ${messageError ? 'border-red-400 focus:ring-red-300' : ''}`}
        />
        {messageError && <p className="text-xs text-red-500 -mt-2">{messageError}</p>}

        <div className="flex items-center gap-2.5 pt-1">
          <input
            id="includePdf"
            type="checkbox"
            checked={includePdf}
            onChange={(e) => setIncludePdf(e.target.checked)}
            className="h-4 w-4 accent-primary-500 cursor-pointer rounded"
          />
          <label htmlFor="includePdf" className="text-sm leading-none text-gray-700 cursor-pointer select-none">
            Include PDF Report
          </label>
        </div>

        {student.last_sent_date && (
          <p className="text-xs text-gray-500">Last Sent {student.last_sent_date}</p>
        )}

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
            loading={isLoading}
            loadingText="Sending..."
          >
            Send Mail
          </Button>
        </div>
      </div>
    </Modal>
  );
}
