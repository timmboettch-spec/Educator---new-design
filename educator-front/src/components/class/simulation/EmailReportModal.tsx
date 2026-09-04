import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clearEmailReportState,
  selectEmailReportError,
  selectEmailReportLoading,
  selectEmailReportSuccess,
  sendEmailReport,
} from '../../../redux/class/EmailReportRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import Modal from '../../ui/Modal';
import Input from '@/components/ui/Input';

interface StudentOption {
  student_id: string;
  student_name: string | null;
  email: string | null;
}

interface Props {
  sim: {
    id: string;
    simulation_name: string;
    class_id?: string;
    access_code?: string;
    last_sent_date?: string;
    [key: string]: unknown;
  };
  students?: StudentOption[];
  onClose: () => void;
}

type Mode = 'individual' | 'bulk';

function Toast({
  message,
  type,
  onDone,
}: {
  message: string;
  type: 'success' | 'error';
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return createPortal(
    <div
      className={`fixed top-6 right-6 z-[9999] flex items-center gap-2 max-w-xs ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      } text-white px-4 py-2.5 rounded-2xl shadow-xl`}
    >
      <svg
        className="w-5 h-5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        {type === 'success' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        )}
      </svg>
      <span className="text-sm font-medium">{message}</span>
    </div>,
    document.body,
  );
}

export default function EmailReportModal({ sim, students, onClose }: Props) {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectEmailReportLoading);
  const isSuccess = useAppSelector(selectEmailReportSuccess);
  const error = useAppSelector(selectEmailReportError);
  const successMessage = useAppSelector((state) => state.EmailReport.response?.message);

  const [mode, setMode] = useState<Mode>('individual');
  const [selectedId, setSelectedId] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Student Progress Report');
  const [message, setMessage] = useState('');
  const [includePdf, setIncludePdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showErrToast, setShowErrToast] = useState(false);

  useEffect(() => {
    if (isSuccess) setShowToast(true);
  }, [isSuccess]);

  useEffect(() => {
    if (error) setShowErrToast(true);
  }, [error]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailReportState());
    };
  }, [dispatch]);

  const handleCopy = () => {
    if (sim.access_code) {
      navigator.clipboard.writeText(sim.access_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSend = () => {
    if (mode === 'individual') {
      dispatch(sendEmailReport({ subject, message, to }));
    } else {
      dispatch(sendEmailReport({ subject, message, class_id: sim.class_id }));
    }
  };

  const handleToastDone = () => {
    setShowToast(false);
    dispatch(clearEmailReportState());
    onClose();
  };

  return (
    <>
      {showToast && (
        <Toast message={successMessage || error || ''} type="success" onDone={handleToastDone} />
      )}
      {showErrToast && error && (
        <Toast
          message={error}
          type="error"
          onDone={() => {
            setShowErrToast(false);
            dispatch(clearEmailReportState());
          }}
        />
      )}

      <Modal
        isOpen={true}
        onClose={onClose}
        title="Email Student Code"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading}
              className="flex-1 py-3 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                'Send Via Email'
              )}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <div className="flex bg-gray-100 rounded-full p-1 gap-1">
              {(['individual', 'bulk'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-5 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${
                    mode === m
                      ? 'bg-primary-500 text-white shadow'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {mode === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              {students && students.length > 0 ? (
                <select
                  value={selectedId}
                  onChange={(e) => {
                    const s = students.find((st) => st.student_id === e.target.value);
                    setSelectedId(e.target.value);
                    setTo(s?.email ?? '');
                  }}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-primary-300"
                >
                  <option value="">Select a student...</option>
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.student_name ?? s.student_id} — {s.email ?? 'No email'}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="Recipient email address"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-primary-300"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message..."
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            />
          </div>

          {mode === 'individual' && sim.access_code && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student Code</label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-center text-primary-500 font-bold tracking-widest text-sm">
                  {sim.access_code}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy Student code"
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  {copied ? (
                    '✓'
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              id="includePdf"
              type="checkbox"
              checked={includePdf}
              onChange={(e) => setIncludePdf(e.target.checked)}
              className="w-4 h-4 accent-primary-500 cursor-pointer"
            />
            <label htmlFor="includePdf" className="text-sm text-gray-700 cursor-pointer">
              Include PDF Report
            </label>
          </div>

          {sim.last_sent_date && (
            <p className="text-xs text-gray-500">Last Sent {sim.last_sent_date}</p>
          )}
        </div>
      </Modal>
    </>
  );
}
