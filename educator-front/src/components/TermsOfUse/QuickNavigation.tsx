import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

interface QuickNavigationProps {
  activeSection: number;
  setActiveSection: (index: number) => void;
  screenType?: 'termsOfUse' | 'privacyPolicy';
  isPrivacyPolicy?: boolean;
}

const QuickNavigation = ({
  activeSection,
  setActiveSection,
  screenType = 'termsOfUse',
  isPrivacyPolicy = false,
}: QuickNavigationProps) => {
  const resolvedScreenType = isPrivacyPolicy ? 'privacyPolicy' : screenType;
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = language === 'es' ? loginEs : loginEn;

  const navigationItems =
    resolvedScreenType === 'privacyPolicy'
      ? locale.privacyPolicy.navItems
      : locale.termsOfUse.navItems;

  return (
    <div className="w-full bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="px-3 py-4 border-b border-gray-200 overflow-hidden">
        <h2 className="text-[16px] font-semibold text-[#4B5563]">
          {locale.termsOfUse.quickNavigation}
        </h2>
      </div>

      <div className="py-2">
        {navigationItems.map((item, index) => (
          <button
            key={index}
            onClick={() => setActiveSection(index)}
            className={`w-full text-left px-5 py-4 transition-all duration-200 relative rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:z-10 ${
              activeSection === index
                ? 'text-[15px] text-[#F28C28] bg-orange-50'
                : 'text-[15px] text-[#5E5E5E] hover:bg-gray-50'
            }`}
          >
            {activeSection === index && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[8px] border-b-[8px] border-l-[8px] border-t-transparent border-b-transparent border-l-[#F28C28]" />
            )}

            <div className="flex items-start">
              <span className="w-6 shrink-0">{index + 1}.</span>
              <span className="leading-6">{item}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickNavigation;
