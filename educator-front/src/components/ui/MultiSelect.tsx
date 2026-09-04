import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

interface Option {
  label: string;
  value: string;
  /**
   * Optional extra lines rendered beneath the label in the dropdown, each
   * indented on its own line (e.g. a class's school + date range). They also
   * participate in the type-to-search match. Not shown in the trigger chips.
   */
  subLabels?: string[];
}

interface MultiSelectProps {
  label?: string;
  options: Option[];
  values: string[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  /**
   * When provided and the typed search has no exact match, a "Create …" row is
   * offered. Should create the item and resolve to its new option (or null on
   * failure). The new value is auto-selected.
   */
  onCreate?: (name: string) => Promise<{ value: string; label: string } | null>;
  createLabel?: (name: string) => string;
  /** Extra classes for the selected-value chips (e.g. a larger font/size). */
  chipClassName?: string;
  /**
   * When true, the trigger shows a compact "N selected" summary instead of
   * listing every selected value as a chip (keeps the box from growing). Items
   * are still viewed/removed from the open dropdown.
   */
  summarize?: boolean;
  /** Noun used in the summary, e.g. "selected" → "3 selected". */
  summarizeNoun?: string;
  /** Renders a red required asterisk after the label (matches SelectField). */
  required?: boolean;
  /**
   * Render the search + checkbox list DIRECTLY inline (always open, no chip
   * trigger, no portal) instead of a trigger that opens a dropdown. Selection is
   * shown via the option checkboxes, so there's no duplicate chip list, and any
   * surrounding Save/Cancel controls stay visible. Opt-in; default is unchanged.
   */
  inline?: boolean;
  /**
   * Inline mode only: cap the scrollable options list at this pixel height
   * (instead of the default ~224px), so a container can size the list to the
   * space it has and be the ONLY thing that scrolls.
   */
  listMaxHeight?: number;
}

/**
 * Brand-styled multi-select: pick several options, each shown as a removable
 * chip in the trigger. Supports type-to-search, Select all / Clear all, and
 * per-item toggle. Hover/selected use brand light gray + black (never peach).
 */
export default function MultiSelect({
  label,
  options,
  values,
  placeholder = "Select",
  searchable = false,
  disabled,
  onChange,
  onCreate,
  createLabel,
  chipClassName,
  summarize = false,
  summarizeNoun = "selected",
  required = false,
  inline = false,
  listMaxHeight,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // Options created inline live here until the parent's option list catches up,
  // so their chips render immediately.
  const [created, setCreated] = useState<Option[]>([]);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  // Roving highlight for keyboard navigation of the options list.
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const allOptions = [
    ...options,
    ...created.filter((c) => !options.some((o) => o.value === c.value)),
  ];
  // Render EVERY selected value as a chip, even one that isn't in `options`
  // (e.g. a value applied from a quick-filter button whose option set differs) —
  // fall back to showing the raw value as its own label instead of hiding it.
  const selected = values.map(
    (v) => allOptions.find((o) => o.value === v) ?? { value: v, label: v },
  );
  const filtered = searchable
    ? allOptions.filter((o) =>
        [o.label, ...(o.subLabels ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : allOptions;
  const trimmed = search.trim();
  const canCreate =
    !!onCreate &&
    trimmed.length > 0 &&
    !allOptions.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  const handleCreate = async () => {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const opt = await onCreate(trimmed);
      if (opt) {
        setCreated((prev) => [...prev, opt]);
        onChange([...values, opt.value]);
      }
    } finally {
      setCreating(false);
      // Close the dropdown and clear the search so it doesn't linger over an
      // inline "add new" form the consumer may reveal (e.g. add-educator).
      setSearch("");
      setOpen(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getPosition = (): React.CSSProperties => {
    const el = triggerRef.current;
    if (!el) return {};
    const rect = el.getBoundingClientRect();
    const dropdownHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < dropdownHeight && spaceAbove >= dropdownHeight;
    return openUpward
      ? {
          position: "fixed",
          bottom: window.innerHeight - rect.top + 6,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
        }
      : {
          position: "fixed",
          top: rect.bottom + 6,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
        };
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => setStyle(getPosition());
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const openDropdown = () => {
    setStyle(getPosition());
    setOpen(true);
  };

  const toggle = (val: string) =>
    onChange(values.includes(val) ? values.filter((v) => v !== val) : [...values, val]);
  const remove = (val: string) => onChange(values.filter((v) => v !== val));
  const clearAll = () => onChange([]);
  const selectAllVisible = () =>
    onChange(Array.from(new Set([...values, ...filtered.map((o) => o.value)])));

  // Reset the highlight when the list closes or the visible set changes.
  useEffect(() => {
    if (!open) setFocusedIndex(-1);
  }, [open]);
  useEffect(() => {
    setFocusedIndex(-1);
  }, [search]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open || focusedIndex < 0 || !listboxRef.current) return;
    const el = listboxRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, open]);

  // Shared arrow/Enter/Home/End handling for both the trigger and the search box.
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(filtered.length - 1);
    } else if (e.key === "Enter") {
      if (focusedIndex >= 0 && focusedIndex < filtered.length) {
        e.preventDefault();
        toggle(filtered[focusedIndex].value);
      } else if (canCreate) {
        e.preventDefault();
        void handleCreate();
      }
    }
  };

  // The search + Select-all/Clear-all + options list. Shared by the portaled
  // dropdown (default) and the inline mode.
  const listBody = (
    <>
      {searchable && (
        <div className="p-2 border-b border-gray-100">
          <input
            autoFocus={!inline}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !inline) {
                e.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
                return;
              }
              handleListKeyDown(e);
            }}
            placeholder="Search…"
            className="w-full h-8 px-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary-400"
          />
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="text-gray-500 hover:text-black font-medium"
        >
          Clear all
        </button>
      </div>

      <div
        ref={listboxRef}
        role="listbox"
        aria-multiselectable="true"
        aria-activedescendant={
          focusedIndex >= 0 && focusedIndex < filtered.length
            ? `multiselect-option-${focusedIndex}`
            : undefined
        }
        className={cn("overflow-y-auto py-1", !(inline && listMaxHeight) && "max-h-56")}
        style={inline && listMaxHeight ? { maxHeight: listMaxHeight } : undefined}
      >
        {filtered.length > 0 ? (
          filtered.map((o, idx) => {
            const checked = values.includes(o.value);
            return (
              <div
                key={o.value}
                id={`multiselect-option-${idx}`}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(o.value)}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={cn(
                  "flex gap-2 px-3 py-2 text-sm cursor-pointer transition-colors",
                  o.subLabels?.length ? "items-start" : "items-center",
                  idx === focusedIndex || checked
                    ? "bg-[#e9e9e9] text-black"
                    : "text-gray-800 hover:bg-[#e9e9e9] hover:text-black",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                    o.subLabels?.length ? "mt-0.5" : "",
                    checked
                      ? "bg-primary-500 border-primary-500 text-white"
                      : "border-gray-300 bg-white",
                  )}
                >
                  {checked && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {o.subLabels?.length ? (
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium">{o.label}</span>
                    {o.subLabels.map((sl, i) => (
                      <span key={i} className="pl-3 text-xs text-gray-500">
                        {sl}
                      </span>
                    ))}
                  </span>
                ) : (
                  o.label
                )}
              </div>
            );
          })
        ) : !canCreate ? (
          <div className="px-3 py-2 text-sm text-gray-500">No data found</div>
        ) : null}

        {canCreate && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-[#e9e9e9] hover:text-black transition-colors disabled:opacity-50 border-t border-gray-100"
          >
            <span className="w-4 h-4 rounded-full bg-primary-500 text-white flex items-center justify-center flex-shrink-0 text-xs leading-none">
              +
            </span>
            {creating
              ? "Creating…"
              : (createLabel?.(trimmed) ?? `Create “${trimmed}”`)}
          </button>
        )}
      </div>
    </>
  );

  // Inline mode: render the list directly (always open, no chip trigger/portal).
  if (inline) {
    return (
      <div ref={containerRef} className="flex flex-col w-full">
        {label && (
          <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2 block">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          {listBody}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full relative">
      {label && (
        <label className="text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div ref={triggerRef} className="relative">
        <div
          ref={buttonRef}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            if (disabled) return;
            open ? setOpen(false) : openDropdown();
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (!open) {
              if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                openDropdown();
              }
              return;
            }
            // Open: navigate the list. When searchable, focus is in the search
            // box and its own handler drives this instead.
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            } else if (e.key === " ") {
              if (focusedIndex >= 0 && focusedIndex < filtered.length) {
                e.preventDefault();
                toggle(filtered[focusedIndex].value);
              }
            } else {
              handleListKeyDown(e);
            }
          }}
          className={cn(
            "w-full min-h-[38px] px-2 py-1 rounded-xl bg-white text-sm flex items-center gap-1 flex-wrap border-2 cursor-pointer outline-none",
            open ? "border-primary-400" : "border-gray-300",
            !disabled && "focus:border-primary-400",
            disabled && "bg-gray-100 cursor-not-allowed opacity-60",
          )}
        >
          {selected.length === 0 ? (
            // flex-1 + min-w-0 + truncate keeps the placeholder on ONE line so
            // the trigger stays at min-h-[38px] (same height as the single-select
            // fields) instead of wrapping the placeholder + chevron on narrow widths.
            <span className="text-gray-500 px-1 py-1 flex-1 min-w-0 truncate">{placeholder}</span>
          ) : summarize ? (
            // Compact count instead of one chip per item, so the box never grows.
            <span className="text-[#5f6060] px-1 py-1 flex-1 min-w-0 truncate font-medium">
              {selected.length} {summarizeNoun}
            </span>
          ) : (
            selected.map((o) => (
              <span
                key={o.value}
                className={cn(
                  "inline-flex items-center gap-1 bg-[#e9e9e9] text-[#5f6060] border border-gray-300 px-3 py-1 rounded-full text-sm",
                  chipClassName,
                )}
              >
                {o.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(o.value);
                  }}
                  className="text-gray-500 hover:text-black"
                  aria-label={`Remove ${o.label}`}
                >
                  ×
                </button>
              </span>
            ))
          )}

          <span className="ml-auto flex items-center gap-2 pl-1">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                className="text-xs text-gray-500 hover:text-black"
                aria-label="Clear all selections"
              >
                Clear
              </button>
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn("text-gray-500 transition-transform duration-200", open && "rotate-180")}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>

        {open &&
          createPortal(
            <div
              ref={dropdownRef}
              data-select-dropdown
              style={style}
              onWheel={(e) => e.nativeEvent.stopPropagation()}
              className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
            >
              {listBody}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
