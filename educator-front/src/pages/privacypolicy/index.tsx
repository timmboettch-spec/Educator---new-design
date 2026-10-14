import { useState, useEffect } from 'react';
import QuickNavigation from '@/components/TermsOfUse/QuickNavigation';
import TermsCardList from '@/components/TermsOfUse/TermsCardList';
import PrivacyPolicyBanner from '@/components/TermsOfUse/PrivacyPolicyBanner';

const PrivacyPolicy = () => {
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="p-8">
      <PrivacyPolicyBanner />

      <div className="flex gap-6 mt-5">
        <div className="w-[320px] shrink-0">
          <QuickNavigation
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            isPrivacyPolicy={true}
          />
        </div>

        <TermsCardList activeSection={activeSection} isPrivacyPolicy={true} />
      </div>
    </div>
  );
};

export default PrivacyPolicy;
