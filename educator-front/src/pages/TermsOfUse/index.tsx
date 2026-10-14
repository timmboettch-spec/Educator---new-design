import { useState } from 'react';
import QuickNavigation from '@/components/TermsOfUse/QuickNavigation';
import TermsOfUseBanner from '@/components/TermsOfUse/TermsOfUseBanner';
import TermsCardList from '@/components/TermsOfUse/TermsCardList';

const TermsOfUse = () => {
  const [activeSection, setActiveSection] = useState(0);

  return (
    <div className="p-8">
      <TermsOfUseBanner />

      <div className="flex gap-6 mt-5">
        <div className="w-[310px] shrink-0">
          <QuickNavigation
            activeSection={activeSection}
            setActiveSection={setActiveSection}
          />
        </div>

        <TermsCardList activeSection={activeSection} />
      </div>
    </div>
  );
};

export default TermsOfUse;
