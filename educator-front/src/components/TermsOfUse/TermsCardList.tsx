import { useEffect } from 'react';
import TermsCard from './TermsCard';
import termsOfUseData from '../../../public/assets/TermsAndPolicies/termsOfUseData.json';
import privacyPolicyData from '../../../public/assets/TermsAndPolicies/termsOfUsePrivacyPolicy.json';

interface TermsCardListProps {
  activeSection: number;
  isPrivacyPolicy?: boolean;
}

const TermsCardList = ({ activeSection, isPrivacyPolicy = false }: TermsCardListProps) => {
  const data = isPrivacyPolicy ? privacyPolicyData : termsOfUseData;
  useEffect(() => {
    const sectionId = String(activeSection + 1).padStart(2, '0');

    const element = document.getElementById(`section-${sectionId}`);

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [activeSection]);
  return (
    <div className="flex-1">
      {data.map((item, index) => (
        <TermsCard
          key={item.id}
          id={item.id}
          title={item.title}
          content={item.content}
          isActive={activeSection === index}
        />
      ))}
    </div>
  );
};
export default TermsCardList;