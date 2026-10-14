import { useState } from 'react';
import HeaderCard from '@/components/contactsupport/HeaderCard';
import SupportList from '@/components/contactsupport/SupportList';
import { supportData } from '../../../public/assets/contactsupport/supportData';
import VideoFooter from '@/components/contactsupport/VideoFooter';
import Footer from '@/components/common/Footer';
import { useNavigate } from 'react-router-dom';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

const CustomerSupport = () => {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = (language === 'es' ? loginEs : loginEn).contactSupport;

  const handleSearch = () => {
    setSearchQuery(inputValue.trim());
  };

  const filteredData = searchQuery
    ? supportData
        .map((section) => ({
          ...section,
          listItem: section.listItem.filter((item) =>
            item.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((section) => section.listItem.length > 0)
    : supportData;

  return (
    <div className="flex flex-col bg-gray-100">
      <HeaderCard
        handleBack={() => navigate(-1)}
        searchValue={inputValue}
        onSearchChange={setInputValue}
        onSearch={handleSearch}
      />
      <div className="grid grid-cols-3 gap-6 p-6">
        {filteredData.length > 0 ? (
          filteredData.map((item, index) => (
            <SupportList
              key={index}
              header={item.header}
              headerIcon={item.headerIcon}
              listItem={item.listItem}
            />
          ))
        ) : (
          <p className="col-span-3 text-center text-gray-500 py-8">
            {(locale.noResultsFor ?? 'No results found for "{query}".').replace(
              '{query}',
              searchQuery
            )}
          </p>
        )}
      </div>
      <div className="mt-12 px-6">
        <VideoFooter />
      </div>
      <Footer />
    </div>
  );
};

export default CustomerSupport;
