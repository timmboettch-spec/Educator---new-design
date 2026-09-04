import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';

interface ProductOption {
  key: string;
  label: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Every product available to the organization the educator can request. */
  products: ProductOption[];
  /** Called with the selected product keys when the educator submits. */
  onSubmit: (keys: string[]) => void;
}

/**
 * Lets an educator (who has no associated products) request one or more product
 * associations from their account administrator. The submit currently raises a
 * toast/notification placeholder — there is no admin-request endpoint yet.
 */
export default function RequestProductAssociationModal({
  isOpen,
  onClose,
  products,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelected([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-lg"
      title="Request Product Association"
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full text-sm font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="gradient"
            disabled={selected.length === 0}
            onClick={() => onSubmit(selected)}
            className="w-1/2 h-11 rounded-full text-white text-sm font-medium disabled:opacity-50"
          >
            Send Request
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Select the product(s) you would like to be associated with. Your account
          administrator will be notified of your request.
        </p>
        {products.length === 0 ? (
          <p className="text-sm text-gray-500">
            No products are available to your organization yet.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {products.map((p) => {
              const checked = selected.includes(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    checked ? 'bg-[#e9e9e9]' : 'hover:bg-[#e9e9e9]'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      checked
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {checked && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggle(p.key)}
                  />
                  <span className="text-sm text-gray-800 break-words">{p.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
