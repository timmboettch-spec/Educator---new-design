import Input from '@/components/ui/Input';
import { PageHeader } from '../../../components/common/PageHeader';
import { useState } from 'react';

export default function Configurations() {
  const [connectionString, setConnectionString] = useState('');
  const handleConnection = () => {};
  const handleEdit = () => {};
  const handleSave = () => {};

  return (
    <div className="min-h-screen p-4 sm:p-6 overflow-y-auto no-scrollbar">
      <PageHeader title={'District Configuration'} actionButton={<></>} />
      <p className="text-sm sm:text-base md:text-lg bg-[#F0F6FB] px-4 py-3 font-semibold text-[#F97316] rounded-lg overflow-hidden break-words">
        DB Connection String
      </p>

      <Input
        type="text"
        placeholder={'Connection String'}
        value={connectionString}
        onChange={(e) => setConnectionString(e.target.value)}
        className="mt-4 sm:mt-8 md:mt-10"
        inputClassName="p-3 sm:p-4 h-12 sm:h-[60px] border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-sm sm:text-base"
      />

      <div className="mt-6 sm:mt-12 md:mt-16 flex flex-wrap justify-end gap-2 sm:gap-4">
        <button
          onClick={handleConnection}
          className="px-5 sm:px-8 md:px-12 py-2 rounded-full text-sm font-medium text-white bg-[#FFC803]"
        >
          Test Connection
        </button>

        <button
          onClick={handleEdit}
          className="px-5 sm:px-8 md:px-12 py-2 rounded-full text-sm font-medium text-white bg-gray-400"
        >
          Edit
        </button>

        <button
          onClick={handleSave}
          className="px-5 sm:px-8 md:px-12 py-2 rounded-full text-sm font-medium text-white bg-[#ED621F]"
        >
          Save
        </button>
      </div>
    </div>
  );
}
