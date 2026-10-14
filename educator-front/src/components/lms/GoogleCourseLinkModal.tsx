import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { Loader2 } from 'lucide-react';
import type { GoogleProvisionItem } from '../../redux/lms/GoogleClassroomRedux';

type GoogleCourseLinkModalProps = {
  isOpen: boolean;
  items: GoogleProvisionItem[];
  linking: boolean;
  title: string;
  subtitle: string;
  googleCourseLabel: string;
  appClassLabel: string;
  selectAllLabel: string;
  selectNoneLabel: string;
  linkSelectedLabel: string;
  notNowLabel: string;
  emptyLabel: string;
  onClose: () => void;
  onLinkSelected: (
    courses: Array<{
      googleCourseId: string;
      googleCourseName: string;
      googleCourseSection?: string;
      googleCourseOwnerId?: string;
    }>
  ) => void;
};

export default function GoogleCourseLinkModal({
  isOpen,
  items,
  linking,
  title,
  subtitle,
  googleCourseLabel,
  appClassLabel,
  selectAllLabel,
  selectNoneLabel,
  linkSelectedLabel,
  notNowLabel,
  emptyLabel,
  onClose,
  onLinkSelected,
}: GoogleCourseLinkModalProps) {
  const linkableItems = useMemo(
    () => items.filter((item) => !item.linked && !item.archived),
    [items]
  );

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setCheckedIds(new Set(linkableItems.map((item) => item.course.id)));
  }, [isOpen, linkableItems]);

  const allChecked =
    linkableItems.length > 0 && checkedIds.size === linkableItems.length;

  const toggleOne = (courseId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const selectAll = () => {
    setCheckedIds(new Set(linkableItems.map((item) => item.course.id)));
  };

  const selectNone = () => {
    setCheckedIds(new Set());
  };

  const handleLink = () => {
    const selectedCourses = linkableItems
      .filter((item) => checkedIds.has(item.course.id))
      .map((item) => ({
        googleCourseId: item.course.id,
        googleCourseName: item.course.name,
        googleCourseSection: item.course.section ?? undefined,
        googleCourseOwnerId: undefined, // Will be filled by the backend
      }));
    onLinkSelected(selectedCourses);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      className="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={linking}
            className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {notNowLabel}
          </button>
          <button
            type="button"
            onClick={handleLink}
            disabled={linking || checkedIds.size === 0}
            aria-busy={linking}
            className="inline-flex items-center gap-2 rounded-lg bg-[#ED621F] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d45518] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {linking ? (
              <Loader2 size={14} aria-hidden="true" className="animate-spin" />
            ) : null}
            {linkSelectedLabel}
            {checkedIds.size > 0 ? ` (${checkedIds.size})` : ''}
          </button>
        </div>
      }
    >
      {linkableItems.length === 0 ? (
        <p className="text-sm text-stone-600">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={linking || allChecked}
              className="text-xs font-semibold text-[#ED621F] hover:underline disabled:opacity-50"
            >
              {selectAllLabel}
            </button>
            <span className="text-xs text-stone-300" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={selectNone}
              disabled={linking || checkedIds.size === 0}
              className="text-xs font-semibold text-stone-600 hover:underline disabled:opacity-50"
            >
              {selectNoneLabel}
            </button>
          </div>

          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
            {linkableItems.map((item) => {
              const checked = checkedIds.has(item.course.id);
              const checkboxId = `gc-link-${item.course.id}`;
              return (
                <li key={item.course.id} className="bg-white px-4 py-3">
                  <label
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={checked}
                      disabled={linking}
                      onChange={() => toggleOne(item.course.id)}
                      className="mt-1 h-4 w-4 rounded border-stone-300 text-[#ED621F] focus:ring-[#ED621F]"
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm font-semibold text-stone-900">
                        <span className="text-stone-500">
                          {googleCourseLabel}:{' '}
                        </span>
                        {item.course.name}
                      </span>
                      <span className="block text-sm text-stone-600">
                        <span className="text-stone-500">
                          {appClassLabel}:{' '}
                        </span>
                        {item.className}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
