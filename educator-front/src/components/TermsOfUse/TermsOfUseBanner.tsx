import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

const TermsOfUseBanner = () => {
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = (language === 'es' ? loginEs : loginEn).termsOfUse;

  return (
    <div className="w-full bg-[#FDEEDE] rounded-3xl px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-[28px] font-bold text-[#F28C28]">
          {locale.bannerTitle}
        </h1>

        <p className="mt-1 text-[20px] text-slate-600 font-[500]">
          {locale.bannerEffectiveDate}
        </p>

        <p className="mt-2 text-sm text-slate-500 font-[500]">
          {locale.bannerSubtitle}
        </p>
      </div>

      <div className="hidden md:block">
        <img
          src="/assets/TermsAndPolicies/terms-of-use-banner.png"
          alt={locale.bannerTitle}
          className="w-44 h-auto object-contain"
        />
      </div>
    </div>
  );
};

export default TermsOfUseBanner;
