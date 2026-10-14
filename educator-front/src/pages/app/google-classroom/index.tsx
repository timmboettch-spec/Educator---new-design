import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '../../../components/common/PageHeader';
import GoogleClassroomPanel from '../../../components/lms/GoogleClassroomPanel';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { useAppSelector } from '../../../store/hooks';
import { selectLoginResponse } from '../../../redux/auth/LoginRedux';
import { getParsedUser } from '../../../utils/storage';
import { isGoogleClassroomEnabledForStoredUser } from '../../../utils/googleClassroomAccess';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

export default function GoogleClassroomPage() {
  const loginResponse = useAppSelector(selectLoginResponse);
  const cookieUser = getParsedUser();
  const reduxUser = loginResponse?.data?.user as
    Record<string, unknown> | null | undefined;

  const googleClassroomEnabled =
    isGoogleClassroomEnabledForStoredUser(cookieUser) &&
    isGoogleClassroomEnabledForStoredUser(reduxUser);

  const language = getStoredLanguage();
  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const pageLocale = locale.googleClassroomPage;

  if (!googleClassroomEnabled) {
    return <Navigate to="/educator-dashboard" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={pageLocale.pageTitle}
        sub_text={pageLocale.pageDescription}
      />
      <GoogleClassroomPanel />
    </div>
  );
}
