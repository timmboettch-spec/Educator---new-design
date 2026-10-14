import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

const PrivacyPolicyBanner = () => {
  const navigate = useNavigate();
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = (language === 'es' ? loginEs : loginEn).privacyPolicy;

  return (
    <div>
      <button
        onClick={() => navigate('/simulation-catalog')}
        className="flex items-center gap-2 mb-3 px-4 py-2 rounded-full bg-[#FDEEDE] text-[#F28C28] text-sm font-semibold hover:bg-orange-100 transition-colors"
      >
        <ArrowLeft size={15} />
        {locale.backToCatalog}
      </button>
      <div className="w-full bg-[#FDEEDE] rounded-3xl px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#F28C28]">
            {locale.bannerTitle}
          </h1>
          <p className="mt-2 text-sm text-slate-500 font-[500]">
            {locale.bannerSubtitle}
          </p>
        </div>
        <div className="hidden md:block">
          <img
            src="/assets/TermsAndPolicies/Manandwomanworkingonfingerprintsecurity.png"
            alt={locale.bannerTitle}
            className="w-44 h-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyBanner;
