export default function ToggleSwitch({
  enabled,
  onChange,
  newClass = '',
}: {
  enabled: boolean;
  onChange: () => void;
  newClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        enabled ? 'bg-primary-500' : 'bg-primary-200 hover:bg-primary/60'
      } ${newClass}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
