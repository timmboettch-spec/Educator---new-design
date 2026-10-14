import { Button, type ButtonProps } from '@/components/ui/Button';

export interface StepAction {
  label: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

interface StepDetailPanelProps {
  label: string;
  /** A paragraph, or a list of bullets. */
  instructions: string | string[];
  actions?: StepAction[];
}

function Bullets({ items }: Readonly<{ items: string[] }>) {
  return (
    <ul className="mt-2 list-disc pl-5">
      {items.map((text) => (
        <li key={text} className="mb-1.5 text-sm leading-[1.55] text-[#5f6060]">
          {text}
        </li>
      ))}
    </ul>
  );
}

/** The setup tracker's detail panel — instructions and calls-to-action for whichever stone is selected. */
export function StepDetailPanel({
  label,
  instructions,
  actions = [],
}: Readonly<StepDetailPanelProps>) {
  return (
    <div className="mt-4 rounded-xl border border-[#e9e9e9] bg-white px-[18px] py-4">
      <div className="text-[12px] font-bold tracking-[0.06em] text-primary-500">
        {label}
      </div>
      {typeof instructions === 'string' ? (
        <p className="mt-2 text-sm leading-[1.55] text-[#5f6060]">
          {instructions}
        </p>
      ) : (
        <Bullets items={instructions} />
      )}
      {actions.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? 'gradient'}
              size={action.size}
              className={action.className ?? 'w-[220px]'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
