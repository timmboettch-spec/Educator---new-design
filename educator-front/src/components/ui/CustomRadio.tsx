import React from 'react';

interface Props {
  label: string;
  checked: boolean;
  onChange: () => void;
}

const CustomRadio: React.FC<Props> = ({ label, checked, onChange }) => {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onChange}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border-2 cursor-pointer text-sm transition focus:outline-none focus-visible:border-primary-400 ${
        checked ? 'border-primary-500 text-primary-500 bg-primary-50' : 'border-gray-200 text-gray-500'
      }`}
    >
      <div
        className={`w-3 h-3 rounded-full border flex items-center justify-center ${
          checked ? 'border-primary-500' : 'border-gray-300'
        }`}
        aria-hidden="true"
      >
        {checked && <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />}
      </div>

      <span>{label}</span>
    </button>
  );
};

export default CustomRadio;
