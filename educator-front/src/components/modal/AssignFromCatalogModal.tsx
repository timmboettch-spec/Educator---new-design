import React, { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import Modal from '../ui/Modal';
import { Button } from '../ui/Button';
import SelectField from '../ui/Select';
import { toast } from '../common/Toast';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import {
  addSimulationRequest,
  clearAddSimulationState,
} from '../../redux/dashboard/simulationlibrary/addsimulationredux';
import {
  FetchClassesRequest,
  selectClasses,
  selectClassListLoading,
} from '../../redux/class/GetClassRedux';
import { fetchMyLibrary } from '../../redux/simulation/MyLibraryRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { Class } from '../../types/Class_types';
import Input from '../ui/Input';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface SimOption {
  id: string;
  title: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  simulationId: string;
  unitId?: string;
}

const toMMDDYYYY = (yyyymmdd: string) => {
  const [y, m, d] = yyyymmdd.split('-');
  return `${m}-${d}-${y}`;
};

const toInputDate = (raw?: string): string => {
  if (!raw) return '';
  const p = dayjs(raw);
  return p.isValid() ? p.format('YYYY-MM-DD') : '';
};

const AssignFromCatalogModal: React.FC<Props> = ({
  isOpen,
  onClose,
  simulationId,
  unitId,
}) => {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const classList = useAppSelector(selectClasses) ?? [];
  const classesLoading = useAppSelector(selectClassListLoading);
  const myLibraryUnits = useAppSelector((s) => s.myLibrary?.units ?? []);
  const myLibraryLoading = useAppSelector((s) => s.myLibrary?.loading ?? false);
  const librarySimulations: SimOption[] = unitId
    ? (
        myLibraryUnits.find((u: { unit_id: string }) => u.unit_id === unitId)
          ?.simulations ?? []
      ).map((s) => ({ id: s.id, title: s.title ?? '' }))
    : [];
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedSimulations, setSelectedSimulations] = useState<SimOption[]>(
    []
  );
  const [simDropdownOpen, setSimDropdownOpen] = useState(false);
  const simDropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState('');
  const [dueDateVal, setDueDateVal] = useState('');
  const [endDateVal, setEndDateVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    class?: string;
    simulation?: string;
    dueDate?: string;
    endDate?: string;
  }>({});

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        simDropdownRef.current &&
        !simDropdownRef.current.contains(e.target as Node)
      )
        setSimDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    dispatch(FetchClassesRequest());
    dispatch(clearAddSimulationState());
    dispatch(fetchMyLibrary());
    setSelectedClass(null);
    setSelectedSimulations([]);
    setDueDateVal('');
    setErrors({});
  }, [isOpen]);

  useEffect(() => {
    if (librarySimulations.length > 0 && simulationId) {
      const match = librarySimulations.find(
        (s) => String(s.id) === String(simulationId)
      );
      if (match) setSelectedSimulations([match]);
    }
  }, [librarySimulations.length]);

  useEffect(() => {
    if (classList.length > 0 && !selectedClass) {
      const first =
        classList.find((c: Class) => c.status?.toUpperCase() !== 'ARCHIEVED') ??
        null;
      if (first) {
        setSelectedClass(first);
        setStartDate(toInputDate(first.start_date));
        setEndDateVal(toInputDate(first.end_date));
      }
    }
  }, [classList, selectedClass]);

  if (!isOpen) return null;

  const toggleSimulation = (sim: SimOption) => {
    setSelectedSimulations((prev) => {
      const exists = prev.find((s) => s.id === sim.id);
      return exists ? prev.filter((s) => s.id !== sim.id) : [...prev, sim];
    });
    setErrors((e) => ({ ...e, simulation: undefined }));
  };

  const handleClassChange = (val: string) => {
    const found = classList.find((c: Class) => c.id === val) ?? null;
    setSelectedClass(found);
    setErrors((e) => ({ ...e, class: undefined }));
    if (found) {
      setStartDate(toInputDate(found.start_date));
      setEndDateVal(toInputDate(found.end_date));
      setDueDateVal('');
    }
  };

  const handleSubmit = async () => {
    const newErrors: typeof errors = {};
    if (!selectedClass) newErrors.class = 'Class is required';
    if (selectedSimulations.length === 0)
      newErrors.simulation = 'At least one simulation is required';
    if (!dueDateVal) newErrors.dueDate = 'Due date is required';
    if (dueDateVal && startDate && endDateVal) {
      const due = dayjs(dueDateVal);
      if (
        due.isBefore(dayjs(startDate), 'day') ||
        due.isAfter(dayjs(endDateVal), 'day')
      )
        newErrors.dueDate = 'Due date must be between Start and End date';
    }
    if (
      endDateVal &&
      dueDateVal &&
      dayjs(endDateVal).isBefore(dayjs(dueDateVal), 'day')
    )
      newErrors.endDate = 'End date cannot be before Due date';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      for (const sim of selectedSimulations) {
        await dispatch(
          addSimulationRequest({
            class_id: selectedClass!.id,
            simulation_id: sim.id,
            start_date: toMMDDYYYY(startDate),
            due_date: toMMDDYYYY(dueDateVal),
            end_date: toMMDDYYYY(endDateVal),
            reduceToken: 0,
          })
        ).unwrap();
      }
      toast.success(locale.toast.simulationAssignedSuccessfully);
      onClose();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message ?? locale.toast.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  };

  const today = dayjs().format('YYYY-MM-DD');
  const classMaxEnd = toInputDate(selectedClass?.end_date);

  const classOptions = classList
    .filter((c: Class) => c.status?.toUpperCase() !== 'ARCHIEVED')
    .map((c: Class) => ({
      label: c.term ? `${c.term} ${c.class_name}` : c.class_name,
      selectedLabel: c.class_name,
      value: c.id,
    }));

  const footer = (
    <div className="flex gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        className="w-1/2 h-11 rounded-full"
      >
        Cancel
      </Button>
      <Button
        variant="default"
        className="w-1/2 h-11 rounded-full bg-orange-500 text-white disabled:opacity-60"
        onClick={handleSubmit}
        loading={submitting}
        loadingText={locale.common.assigning}
      >
        Assign
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign to Class"
      footer={footer}
    >
      <div className="mb-4">
        <SelectField
          label="Class Name"
          required
          options={classOptions}
          value={selectedClass?.id ?? ''}
          placeholder={classesLoading ? 'Loading classes...' : 'Select a class'}
          onChange={handleClassChange}
          error={errors.class}
        />
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Date Range
        </label>
        <div className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 bg-gray-100 text-sm text-gray-500 flex items-center">
          {selectedClass?.start_date || selectedClass?.end_date ? (
            `${selectedClass.start_date ? dayjs(selectedClass.start_date, ['YYYY-MM-DD', 'MM-DD-YYYY', 'MM/DD/YYYY']).format('MM/DD/YYYY') : '—'} - ${selectedClass.end_date ? dayjs(selectedClass.end_date, ['YYYY-MM-DD', 'MM-DD-YYYY', 'MM/DD/YYYY']).format('MM/DD/YYYY') : '—'}`
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      </div>

      {/* Simulation multi-select dropdown */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Simulation <span className="text-red-500">*</span>
        </label>
        <div ref={simDropdownRef} className="relative">
          <div
            onClick={() => setSimDropdownOpen((p) => !p)}
            className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-white text-sm flex flex-wrap items-center gap-1.5 border-2 transition-all cursor-pointer ${
              simDropdownOpen
                ? 'border-orange-400'
                : errors.simulation
                  ? 'border-red-400'
                  : 'border-gray-300'
            }`}
          >
            {selectedSimulations.length === 0 ? (
              <span className="text-gray-400 flex-1">
                {myLibraryLoading
                  ? 'Loading simulations...'
                  : 'Select simulation'}
              </span>
            ) : (
              selectedSimulations.map((sim) => (
                <span
                  key={sim.id}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 bg-orange-100 text-orange-600 text-xs font-medium pl-2.5 pr-1.5 py-0.5 rounded-md"
                >
                  {sim.title}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSimulation(sim);
                    }}
                    className="text-orange-400 hover:text-orange-700"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-gray-500 transition-transform duration-200 ml-auto shrink-0 ${simDropdownOpen ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          {simDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
              {librarySimulations.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400">
                  No simulations in your library for this unit
                </div>
              ) : (
                librarySimulations.map((sim) => {
                  const checked = !!selectedSimulations.find(
                    (s) => s.id === sim.id
                  );
                  return (
                    <div
                      key={sim.id}
                      onClick={() => toggleSimulation(sim)}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-orange-50 transition-colors"
                    >
                      <Input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="w-4 h-4 accent-orange-500 cursor-pointer shrink-0"
                      />
                      <span
                        className={`text-sm ${checked ? 'text-orange-500 font-medium' : 'text-gray-800'}`}
                      >
                        {sim.title}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        {errors.simulation && (
          <p className="text-[10px] text-red-500 mt-1">{errors.simulation}</p>
        )}
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Simulation Assignment Duration
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: 'Start Date',
              value: startDate,
              readOnly: true,
              key: 'start',
            },
            {
              label: 'Due Date',
              value: dueDateVal,
              readOnly: false,
              key: 'due',
            },
            {
              label: 'End Date',
              value: endDateVal,
              readOnly: false,
              key: 'end',
            },
          ].map((f) => (
            <div key={f.key}>
              <p className="text-sm text-gray-700 font-medium mb-1">
                {f.label}{' '}
                {f.key === 'due' && <span className="text-red-500">*</span>}
              </p>
              <Input
                type="text"
                readOnly
                tabIndex={f.readOnly ? -1 : 0}
                placeholder="MM/DD/YYYY"
                value={f.value ? dayjs(f.value).format('MM/DD/YYYY') : ''}
                onClick={(e) =>
                  !f.readOnly &&
                  (
                    e.currentTarget.nextElementSibling as HTMLInputElement
                  )?.showPicker?.()
                }
                onKeyDown={(e) => {
                  if (!f.readOnly && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    (
                      e.currentTarget.nextElementSibling as HTMLInputElement
                    )?.showPicker?.();
                  }
                }}
                className={`w-full h-[38px] px-2 rounded-xl border-2 border-gray-300 text-xs focus:outline-none focus:border-orange-400 ${
                  f.readOnly
                    ? 'bg-gray-100 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
              />
              <Input
                type="date"
                value={
                  f.key === 'due'
                    ? dueDateVal
                    : f.key === 'end'
                      ? endDateVal
                      : f.value
                }
                min={
                  f.key === 'due'
                    ? startDate && startDate > today
                      ? startDate
                      : today
                    : f.key === 'end'
                      ? (() => {
                          const base = dueDateVal || startDate;
                          return base && base > today ? base : today;
                        })()
                      : undefined
                }
                max={
                  f.key === 'due'
                    ? endDateVal || undefined
                    : f.key === 'end'
                      ? classMaxEnd || undefined
                      : undefined
                }
                disabled={f.readOnly}
                tabIndex={-1}
                onChange={(e) => {
                  const newVal = e.target.value;
                  if (f.key === 'due') {
                    // Guard against out-of-range values some browsers allow via manual keyboard entry
                    const minDue =
                      startDate && startDate > today ? startDate : today;
                    if (newVal < minDue) return;
                    if (endDateVal && newVal > endDateVal) return;
                    setDueDateVal(newVal);
                    setErrors((p) => ({ ...p, dueDate: undefined }));
                  } else if (f.key === 'end') {
                    const base = dueDateVal || startDate;
                    const minEnd = base && base > today ? base : today;
                    if (newVal < minEnd) return;
                    if (classMaxEnd && newVal > classMaxEnd) return;
                    setEndDateVal(newVal);
                    setErrors((p) => ({ ...p, endDate: undefined }));
                  }
                }}
                className="sr-only"
              />
              {f.key === 'due' && errors.dueDate && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  {errors.dueDate}
                </p>
              )}
              {f.key === 'end' && errors.endDate && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  {errors.endDate}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default AssignFromCatalogModal;
