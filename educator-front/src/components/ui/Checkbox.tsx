interface Props {
  label?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
}

export default function Checkbox({ label, checked, onChange, name }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onChange?.({ target: { checked: !checked } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-1 ${
          checked ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-300'
        }`}
      >
        {checked && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path
              d="M1 4L4 7.5L10 1"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label && <span className="text-sm text-gray-500">{label}</span>}
    </label>
  );
}
