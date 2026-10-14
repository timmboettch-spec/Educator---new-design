import { useEffect, useState } from 'react';
import { toast } from '../../../components/common/Toast';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  generateZipAsBase64,
  type StudentNameById,
  type StudentIdentityById,
} from '../../../components/reports/generateReportPDF';
import {
  clearEmailReportState,
  selectEmailReportError,
  selectEmailReportLoading,
  selectEmailReportSuccess,
  sendEmailReportRequest,
} from '../../../redux/class/StudentEmailReportRedux';
import { selectCurrentUser } from '../../../redux/auth/LoginRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import type { SimulationReport } from '../../../redux/class/SimsCompletedreportsRedux';
import type { Student } from '../../../types';
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
  /** Reports for the simulation — same list used by Export Report. */
  reports: SimulationReport[];
  /** Students in the class, used to resolve names/class name for PDF metadata. */
  students?: Student[];
  classId: string;
  className?: string;
  /** Fallback recipient when auth is unavailable. */
  toEmail?: string;
  onClose: () => void;
}

/**
 * Bulk Assessment Report Email Modal
 *
 * Uses the **exact same PDF generation pipeline** as Export Report
 * (`generateZipAsBase64` → `buildStudentReportPDF`) so every PDF inside
 * the ZIP is byte-for-byte identical to the exported download.
 *
 * - 1 report  → 1 PDF attachment.
 * - 2+ reports → AssessmentReports.zip containing one PDF per student.
 */
export default function BulkStudentEmailReportModal({
  reports,
  students,
  classId,
  className,
  toEmail,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const isLoading = useAppSelector(selectEmailReportLoading);
  const isSuccess = useAppSelector(selectEmailReportSuccess);
  const error = useAppSelector(selectEmailReportError);
  const successMessage = useAppSelector(
    (state) => state.StudentEmailReport.message
  );
  const currentUser = useAppSelector(selectCurrentUser);
  const educatorEmail = currentUser?.email ?? toEmail ?? '';

  const isBulk = reports.length > 1;

  const [subject, setSubject] = useState('Student Assessment Reports');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(educatorEmail);
  const [messageError, setMessageError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (educatorEmail && !recipientEmail) setRecipientEmail(educatorEmail);
  }, [educatorEmail]);

  useEffect(() => {
    if (isSuccess) {
      const msg = successMessage;
      dispatch(clearEmailReportState());
      onClose();
      setTimeout(
        () => toast.success(msg || locale.toast.emailSentSuccessfully),
        100
      );
    }
  }, [
    isSuccess,
    successMessage,
    dispatch,
    onClose,
    locale.toast.emailSentSuccessfully,
  ]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailReportState());
    };
  }, [dispatch]);

  const buildIdentityMaps = (): {
    studentNameById: StudentNameById;
    studentIdentityById: StudentIdentityById;
  } => {
    const studentNameById: StudentNameById = {};
    const studentIdentityById: StudentIdentityById = {};
    for (const s of students ?? []) {
      const name = s.student_name ?? undefined;
      const code = s.student_id ?? undefined;
      const identity = {
        studentName: name,
        studentCode: code,
        studentEmail: s.email ?? undefined,
        className: className ?? undefined,
      };
      [s.user_id, s.student_id, s.id].filter(Boolean).forEach((key) => {
        studentNameById[key!] = name ?? code ?? '';
        studentIdentityById[key!] = identity;
      });
    }
    return { studentNameById, studentIdentityById };
  };

  const handleSend = async () => {
    if (!recipientEmail.trim()) {
      setEmailError('Educator email is required');
      toast.error(locale.toast.educatorEmailRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      setEmailError('Invalid email address');
      toast.error(locale.toast.invalidEmail);
      return;
    }
    setEmailError('');
    if (!message.trim()) {
      setMessageError('Message is required');
      return;
    }
    setMessageError('');
    if (reports.length === 0) {
      toast.error(locale.toast.noReportsAvailable);
      return;
    }

    setIsGenerating(true);
    try {
      const { studentNameById, studentIdentityById } = buildIdentityMaps();
      // Same pipeline as Export Report — produces identical PDFs.
      const zipBase64 = await generateZipAsBase64(
        reports,
        studentNameById,
        studentIdentityById
      );
      if (!zipBase64) {
        toast.error(locale.toast.noPdfGenerated);
        return;
      }
      dispatch(
        sendEmailReportRequest({
          subject,
          message,
          sendPdf: true,
          class_id: classId,
          email: recipientEmail,
          zip_base64: zipBase64,
          zip_filename: 'AssessmentReports.zip',
        })
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to generate Assessment Report ZIP'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const isBusy = isLoading || isGenerating;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        isBulk
          ? `Email ${reports.length} Assessment Reports`
          : 'Email Assessment Report'
      }
    >
      <div className="flex flex-col gap-4">
        {isBulk && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800">
            <p className="font-semibold mb-1">Bulk Report Email</p>
            <p>
              A single email with <strong>AssessmentReports.zip</strong> (
              {reports.length} PDFs) will be sent. Each PDF is identical to the
              Export Report PDF.
            </p>
          </div>
        )}

        <Input
          label="To (Educator)"
          value={recipientEmail}
          onChange={(e) => {
            setRecipientEmail(e.target.value);
            if (e.target.value.trim()) setEmailError('');
          }}
          placeholder="educator@example.com"
          error={emailError}
        />

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Student Assessment Reports"
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
        {messageError && (
          <p className="text-xs text-red-500 -mt-2">{messageError}</p>
        )}

        <div className="flex gap-3 mt-2">
          <Button
            variant="secondary"
            className="w-1/2 h-11 rounded-full text-sm font-medium"
            onClick={onClose}
            disabled={isBusy}
          >
            Back
          </Button>
          <Button
            variant="gradient"
            className="flex-1 h-11 rounded-full text-sm"
            onClick={handleSend}
            loading={isBusy}
            loadingText={
              isGenerating
                ? locale.common.generatingPdfs
                : locale.common.sending
            }
          >
            {isBulk ? 'Send ZIP Email' : 'Send Email'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
