import { Loader2 } from 'lucide-react';

interface DropdownLoaderProps {
  /** Read out by screen readers in place of the visible spinner. */
  label: string;
}

/** A spinner for a dropdown's loading row; the caller provides the row. */
export function DropdownLoader({ label }: DropdownLoaderProps) {
  return (
    <>
      <Loader2
        size={16}
        aria-hidden="true"
        className="animate-spin text-primary-500"
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
