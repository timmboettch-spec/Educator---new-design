import { useState } from "react";
import { CircleCheck, ChevronDown, ChevronUp } from "lucide-react";

interface SupportListProps {
  header?: string;
  headerIcon?: string;
  listItem: string[];
}

export default function SupportList({
  header,
  headerIcon,
  listItem,
}: SupportListProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? listItem : listItem.slice(0, 5);

  return (
    <div className="bg-white w-full overflow-hidden rounded-xl border border-gray-200">
      {(header || headerIcon) && (
        <div className="flex items-center gap-2 px-6 py-4 border-b bg-gray-50">
          {headerIcon && <img src={headerIcon} alt={header} />}
          <h3 className="font-medium text-primary-500 text-xl">{header}</h3>
        </div>
      )}

      {visibleItems.map((item, index) => (
        <div
          key={index}
          className="flex items-center gap-2 py-2 px-6 border-b last:border-b-0 cursor-pointer hover:bg-gray-50"
        >
          <CircleCheck className="h-3 w-3" />
          <p className="text-gray-800 text-sm">{item}</p>
        </div>
      ))}

      {listItem.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary-500 hover:bg-gray-50 transition"
        >
          {showAll ? (
            <>
              Show Less
              <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show all articles ({listItem.length})
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}