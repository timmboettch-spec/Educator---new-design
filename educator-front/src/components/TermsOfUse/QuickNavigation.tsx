import React from 'react';

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

  const navigationItems =
    resolvedScreenType === 'privacyPolicy'
      ? [
          'Information Collection, Use and Sharing',
          'Your Access to and Control Over Information',
          'Security',
          "Using Realityworks' Products",
          'Registration',
          'Orders',
          'Cookies and Analytics',
          'Links',
          'Surveys & Contests',
          'Questions',
        ]
      : [
          'Acceptance of Terms of Use and Amendments',
          "The Site Editor's Service",
          'Your Responsibilities and Registration Obligations',
          'Privacy Policy',
          'Registration and Password',
          'Your Conduct',
          'Submission of Content on the Realityworks Web Site',
          'Third-Party Services',
          'Indemnification',
          'DISCLAIMER OF WARRANTIES',
          'LIMITATION OF LIABILITY',
          'Reservation of Rights',
          'Notification of Copyright Infringement',
          'Applicable Law',
          'Miscellaneous Information',
        ];

  return (
    <div className="w-full bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <div className="px-3 py-4 border-b border-gray-200 overflow-hidden">
        <h2 className="text-[16px] font-semibold text-[#4B5563]">
          Quick Navigation
        </h2>
      </div>

      <div className="py-2">
        {navigationItems.map((item, index) => (
          <button
            key={index}
            onClick={() => setActiveSection(index)}
            className={`w-full text-left px-5 py-4 transition-all duration-200 relative rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:z-10 ${
              activeSection === index
                ? 'text-[15px] text-[#F28C28] bg-primary-50'
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