import { useNavigate, useParams, useLocation } from 'react-router-dom';
import StudentTranscriptView from '../../student-reports/transcript/page';

export default function UserTranscriptPage() {
  const navigate = useNavigate();
  const { attemptId } = useParams<{ attemptId: string }>();
  const { state } = useLocation() as {
    state?: {
      backPath?: string;
      backState?: Record<string, unknown>;
      className?: string;
    };
  };

  const reportId = attemptId ?? '';

  const handleBack = () => {
    if (state?.backPath) {
      navigate(
        state.backPath,
        state.backState ? { state: state.backState } : undefined
      );
      return;
    }
    navigate(-1);
  };

  if (!reportId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <p className="text-gray-600">Transcript not found.</p>
      </div>
    );
  }

  return (
    <StudentTranscriptView
      reportId={reportId}
      variant="educator"
      classNameOverride={state?.className}
      onBack={handleBack}
    />
  );
}
