import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import MultiSelect from "../ui/MultiSelect";

interface ProductOption {
  value: string;
  label: string;
  subLabels?: string[];
}

interface AssociatedProductsPopoverProps {
  /** Associated-product count shown in the table cell (the trigger). */
  count: number;
  /** Educator name, shown in the popover header for clarity. */
  educatorName: string;
  /** All products the admin is entitled to (name label + usage/expiry subLabels). */
  options: ProductOption[];
  /** Currently-associated product keys for this educator. */
  values: string[];
  /** Persist the new association set. */
  onChange: (keys: string[]) => void;
  ariaLabel: string;
  /**
   * Trigger appearance. `"count"` (default) renders the associated-products
   * count chip used in the table cell; `"button"` renders a full "Add Product
   * Association" pill (used below the products subtable).
   */
  variant?: "count" | "button";
  /** Header title. Default "Associated Products" (educator→products case). */
  title?: string;
  /** Header subject label before the name, e.g. "Educator" or "Product". */
  subjectLabel?: string;
  /** Small caption above the selector list. */
  bodyLabel?: string;
  /** Gray helper note under the selector. */
  noteText?: string;
}

// Matches the view/edit educator modal width (max-w-2xl = 672px), clamped to the
// viewport on narrow screens.
const PANEL_MAX_WIDTH = 672;

type Placement = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

/**
 * Clicking the Associated-Products count opens this popover — the SAME associated-
 * products selector used in the view/edit educator modals (product name + usage +
 * expiry per option), so the admin can see and edit associations inline without
 * opening the full modal. It flips above/below the trigger to stay fully in view,
 * caps its height (internal scroll), and closes when the page scrolls.
 */
export default function AssociatedProductsPopover({
  count,
  educatorName,
  options,
  values,
  onChange,
  ariaLabel,
  variant = "count",
  title = "Associated Products",
  subjectLabel = "Educator",
  bodyLabel = "Products this educator can use",
  noteText = "Associating a product informs the educator the products they have access to use and allows for tracking of products used.",
}: AssociatedProductsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Placement | null>(null);
  // Draft selection — changes are pending until Save (Cancel reverts).
  const [draft, setDraft] = useState<string[]>(values);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const sorted = (a: string[]) => [...a].sort().join("|");
  const dirty = sorted(draft) !== sorted(values);

  const openPanel = () => {
    setDraft(values);
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 16);
    // Right-align to the trigger so a wide panel doesn't run off-screen.
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    );
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    // Open on whichever side has MORE room, and cap the panel to that space so
    // it always stays fully on-screen (the inner list scrolls within it).
    if (spaceBelow >= spaceAbove) {
      setPos({ left, width, top: rect.bottom + 6, maxHeight: spaceBelow - 6 });
    } else {
      setPos({
        left,
        width,
        bottom: window.innerHeight - rect.top + 6,
        maxHeight: spaceAbove - 6,
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const inPopoverUI = (t: Node | null) =>
      !!t &&
      (panelRef.current?.contains(t) ||
        (t as HTMLElement).closest?.("[data-select-dropdown]"));
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (btnRef.current?.contains(t) || inPopoverUI(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Close when the PAGE scrolls; ignore scrolling inside the panel / its
    // portaled options list.
    const onScroll = (e: Event) => {
      if (inPopoverUI(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      {variant === "button" ? (
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (open) setOpen(false);
            else openPanel();
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          title={ariaLabel}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-4 py-2 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
        >
          <Plus size={16} aria-hidden="true" />
          Add Product Association
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (open) setOpen(false);
            else openPanel();
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={`text-sm tabular-nums cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 rounded-full ${
            count === 0
              ? "inline-flex font-semibold text-primary-700 border border-primary-500 px-2 py-0.5 hover:bg-[#e9e9e9]"
              : "text-gray-700 underline decoration-dotted underline-offset-2 hover:text-primary-600 px-1"
          }`}
        >
          {count}
        </button>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${title} — ${educatorName}`}
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 9998,
            }}
            className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: title + educator name + (Save/Cancel when dirty) + close.
                Save/Cancel live here — NOT in a bottom footer — so the portaled
                selector dropdown can't hide them; they stay visible to commit. */}
            <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {title}
                </p>
                <p className="text-base font-semibold text-primary-600 break-words">
                  {subjectLabel}: {educatorName}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {dirty && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDraft(values)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-300 hover:bg-[#e9e9e9] rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <X size={14} aria-hidden="true" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange(draft)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <Check size={14} aria-hidden="true" />
                      Save changes
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-1 -mr-1 rounded-full text-gray-500 hover:text-black hover:bg-[#e9e9e9] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Body — does NOT scroll; only the inner product list scrolls
                (its height is sized to the space the panel has). */}
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-gray-600 mb-2">
                {bodyLabel}
              </p>
              <MultiSelect
                values={draft}
                options={options}
                onChange={setDraft}
                searchable
                inline
                listMaxHeight={Math.max(140, (pos.maxHeight ?? 400) - 270)}
                placeholder="Search to associate…"
              />
              {noteText && (
                <p className="text-xs text-primary-700 bg-[#e9e9e9] rounded-md px-3 py-2 mt-2">
                  {noteText}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
