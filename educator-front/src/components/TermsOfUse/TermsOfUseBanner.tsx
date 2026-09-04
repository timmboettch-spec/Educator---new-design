const TermsOfUseBanner = () => {
  return (
    <div className="w-full bg-[#FDEEDE] rounded-3xl px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-[28px] font-bold text-[#F28C28]">Terms of Use</h1>

        <p className="mt-1 text-[20px] text-slate-600 font-[500]">Effective June 2026</p>

        <p className="mt-2 text-sm text-slate-500 font-[500]">
          Read our terms of use before using Realityworks
        </p>
      </div>

      <div className="hidden md:block">
        <img
          src="/assets/TermsAndPolicies/terms-of-use-banner.png"
          alt="Terms of Use"
          className="w-44 h-auto object-contain"
        />
      </div>
    </div>
  );
};

export default TermsOfUseBanner;
