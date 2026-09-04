import { useEffect, useState } from 'react';
import { toast } from '../../components/common/Toast';
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

interface Props {
  classId: string;
  onClose: () => void;
}

export default function ClassEmailReportModal({ classId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectEmailReportLoading);
  const error = useAppSelector(selectEmailReportError);
  const isSuccess = useAppSelector(selectEmailReportSuccess);
  const [subject, setSubject] = useState('Student Progress Report');
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | undefined>();
  const [includePdf, setIncludePdf] = useState(false);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (isSuccess) {
      toast.success('Report sent successfully to all students in the class!');
      dispatch(clearEmailReportState());
      onClose();
    }
  }, [isSuccess, dispatch, onClose]);

  useEffect(() => {
    return () => {
      dispatch(clearEmailReportState());
    };
  }, [dispatch]);

  const handleSend = () => {
    if (!message.trim()) {
      setMessageError('Message is required');
      return;
    }
    setMessageError(undefined);
    dispatch(
      sendEmailReportRequest({
        subject,
        message,
        sendPdf: includePdf,
        class_id: classId,
      }),
    );
  };

  return (
    <Modal isOpen onClose={onClose} title="Email Report">
      <div className="flex flex-col gap-4">
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Student Progress Report"
        />

        <Textarea
          label="Message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (e.target.value.trim()) setMessageError(undefined);
          }}
          placeholder="Add a message..."
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
            className="h-4 w-4 accent-primary-500 cursor-pointer rounded"
          />
          <label htmlFor="includePdfClass" className="text-sm leading-none text-gray-700 cursor-pointer select-none">
            Include PDF Report
          </label>
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
